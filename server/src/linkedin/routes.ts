import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ApiErrorBody } from '../../../shared/leadSearch.js';
import type { LeadDetailResponse } from '../../../shared/leads.js';
import { AUTH_FOUNDER_IDS } from '../../../shared/auth.js';
import {
  INVITE_NOTE_MAX_LENGTH,
  MESSAGE_MAX_LENGTH,
  type LinkedInAccountsResponse,
  type LinkedInTestInviteResponse,
  type LinkedInTestConnectResponse,
  type LinkedInTestMessageResponse,
  type LinkedInTestProfileResponse,
} from '../../../shared/linkedin.js';
import { DuplicateEventError, LeadNotFoundError, type LeadStore } from '../leads/leadStore.js';
import { ROLE_MESSAGES, actingFounder, actorFor, assistantDenial } from '../auth/roles.js';
import { LinkedInError, type LinkedInService } from './service.js';

/**
 * Routen laut Vertrag `shared/linkedin.ts`. Gesendet wird mit dem Account des Gründers des Kontos (Mitarbeiter: sein
 * Gründer). Admin-Konten (ohne Gründer) lehnt schon der Hook in `auth/auth.ts` ab (403 not_allowed, `auth/roles.ts`),
 * Mitarbeiter auf Leads anderer Gründer der Hook in `leads/routes.ts`.
 */

const IdParams = z.object({ id: z.string().min(1).max(64) });
const clientId = z.string().trim().min(1).max(64).optional();
const InviteSchema = z.object({
  message: z.string().trim().max(INVITE_NOTE_MAX_LENGTH, `Die Notiz darf höchstens ${INVITE_NOTE_MAX_LENGTH} Zeichen haben.`).optional(),
  clientId,
});
const MessageSchema = z.object({
  clientId,
  text: z.string().trim().min(1, 'Bitte einen Text eingeben.').max(MESSAGE_MAX_LENGTH, `Höchstens ${MESSAGE_MAX_LENGTH} Zeichen.`),
  label: z.string().trim().max(40).optional(),
});

const founderField = z.enum(AUTH_FOUNDER_IDS, `Gründer muss ${AUTH_FOUNDER_IDS.join(' oder ')} sein.`);
/** LinkedIn-Profil-Link (https://www.linkedin.com/in/…) oder öffentliche Kennung. */
const PROFILE_URL = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([^/?#\s]+)\/?(?:[?#].*)?$/i;
const PROFILE_ID = /^[A-Za-z0-9_%-]{2,100}$/;
const PROFILE_RULE = 'Bitte einen LinkedIn-Profil-Link (https://www.linkedin.com/in/…) oder die Kennung aus dem Link angeben.';
const TestInviteSchema = z.object({
  founder: founderField,
  profile: z.string(PROFILE_RULE).trim().min(1, PROFILE_RULE).max(300, PROFILE_RULE),
  message: z.string().trim().max(INVITE_NOTE_MAX_LENGTH, `Die Notiz darf höchstens ${INVITE_NOTE_MAX_LENGTH} Zeichen haben.`).optional(),
});
const ResumeSchema = z.object({ founder: founderField });
const TestProfileSchema = z.object({ founder: founderField, profile: z.string(PROFILE_RULE).trim().min(1, PROFILE_RULE).max(300, PROFILE_RULE) });
const TestConnectSchema = z.object({
  founder: founderField,
  message: z.string().trim().max(INVITE_NOTE_MAX_LENGTH, `Die Notiz darf höchstens ${INVITE_NOTE_MAX_LENGTH} Zeichen haben.`).optional(),
});
const TestMessageSchema = z.object({
  founder: founderField,
  text: z.string('Bitte einen Text eingeben.').trim().min(1, 'Bitte einen Text eingeben.').max(MESSAGE_MAX_LENGTH, `Höchstens ${MESSAGE_MAX_LENGTH} Zeichen.`),
});

/** Profil-Link oder Kennung → öffentliche Kennung (wie `linkedinCli test-anfrage`); null = ungültig. */
export function profileIdentifier(input: string): string | null {
  const text = input.trim();
  const fromUrl = text.match(PROFILE_URL)?.[1];
  let identifier = fromUrl ?? text;
  try {
    identifier = decodeURIComponent(identifier);
  } catch {
    return null;
  }
  return fromUrl ? (identifier.length > 0 && identifier.length <= 100 && !/[\s/]/.test(identifier) ? identifier : null) : PROFILE_ID.test(text) ? identifier : null;
}

function sendError(reply: FastifyReply, status: number, code: string, message: string, retryAfter?: number) {
  if (retryAfter) reply.header('Retry-After', String(retryAfter));
  const body: ApiErrorBody = { error: { code, message } };
  return reply.status(status).send(body);
}

export function registerLinkedInRoutes(app: FastifyInstance, { leads, linkedin }: { leads: LeadStore; linkedin: LinkedInService }) {
  const detail = (id: string): LeadDetailResponse => ({ lead: leads.get(id)!, events: leads.events(id) });

  const handle = async (reply: FastifyReply, id: string, work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (error) {
      if (error instanceof DuplicateEventError) return { ...detail(id), duplicate: true };
      if (error instanceof LeadNotFoundError) return sendError(reply, 404, 'not_found', error.message);
      if (error instanceof LinkedInError) return sendError(reply, error.status, error.code, error.message, error.retryAfter);
      throw error;
    }
    return detail(id);
  };

  app.get('/api/linkedin/status', async () => linkedin.status());

  app.post('/api/linkedin/sync', async () => linkedin.sync());

  // ── Einrichten in der Oberfläche (Rechte: Hook in auth.ts → `roleDenial`) ──

  app.get('/api/linkedin/accounts', async (_request, reply) => {
    try {
      const body: LinkedInAccountsResponse = { accounts: await linkedin.unipileAccounts() };
      return body;
    } catch (error) {
      if (error instanceof LinkedInError) return sendError(reply, error.status, error.code, error.message, error.retryAfter);
      throw error;
    }
  });

  app.post('/api/linkedin/test-invite', async (request, reply) => {
    const body = TestInviteSchema.safeParse(request.body ?? {});
    if (!body.success) return sendError(reply, 400, 'invalid_request', body.error.issues.map((issue) => issue.message).join(' '));
    const identifier = profileIdentifier(body.data.profile);
    if (!identifier) return sendError(reply, 400, 'invalid_request', PROFILE_RULE);
    // Gründer nur über den eigenen Account (Admins und Mitarbeiter sperrt schon der Hook, `roleDenial`).
    const user = request.authUser;
    if (user && user.founder !== body.data.founder) return sendError(reply, 403, 'not_allowed', ROLE_MESSAGES.linkedinOwnAccount);
    if (linkedin.mode === 'mock') {
      const simulated: LinkedInTestInviteResponse = { ok: true, message: 'Simulation – nichts gesendet.' };
      return simulated;
    }
    try {
      const { name } = await linkedin.testInvite(body.data.founder, identifier, body.data.message);
      request.log.info({ founder: body.data.founder, by: request.authUser?.username }, 'LinkedIn-Test-Anfrage gesendet');
      const sent: LinkedInTestInviteResponse = { ok: true, message: `Anfrage an ${name} gesendet.` };
      return sent;
    } catch (error) {
      if (error instanceof LinkedInError) return sendError(reply, error.status, error.code, error.message, error.retryAfter);
      throw error;
    }
  });

  // Test-LinkedIn-Account (Vertrag shared/linkedin.ts): prüfen, speichern, genau eine Test-Nachricht senden.
  app.get('/api/linkedin/test-profile', async (): Promise<LinkedInTestProfileResponse> => ({ profile: linkedin.testProfile() }));

  app.put('/api/linkedin/test-profile', async (request, reply) => {
    const body = TestProfileSchema.safeParse(request.body ?? {});
    if (!body.success) return sendError(reply, 400, 'invalid_request', body.error.issues.map((issue) => issue.message).join(' '));
    const identifier = profileIdentifier(body.data.profile);
    if (!identifier) return sendError(reply, 400, 'invalid_request', PROFILE_RULE);
    const user = request.authUser;
    if (user && user.founder !== body.data.founder) return sendError(reply, 403, 'not_allowed', ROLE_MESSAGES.linkedinOwnAccount);
    try {
      const response: LinkedInTestProfileResponse = { profile: await linkedin.setTestProfile(body.data.founder, identifier) };
      return response;
    } catch (error) {
      if (error instanceof LinkedInError) return sendError(reply, error.status, error.code, error.message, error.retryAfter);
      throw error;
    }
  });

  app.delete('/api/linkedin/test-profile', async (): Promise<LinkedInTestProfileResponse> => {
    linkedin.clearTestProfile();
    return { profile: null };
  });

  app.post('/api/linkedin/test-message', async (request, reply) => {
    const body = TestMessageSchema.safeParse(request.body ?? {});
    if (!body.success) return sendError(reply, 400, 'invalid_request', body.error.issues.map((issue) => issue.message).join(' '));
    const user = request.authUser;
    if (user && user.founder !== body.data.founder) return sendError(reply, 403, 'not_allowed', ROLE_MESSAGES.linkedinOwnAccount);
    try {
      const { name } = await linkedin.testMessage(body.data.founder, body.data.text);
      const simulated = linkedin.mode === 'mock';
      if (!simulated) request.log.info({ founder: body.data.founder, by: request.authUser?.username }, 'LinkedIn-Test-Nachricht gesendet');
      const response: LinkedInTestMessageResponse = { ok: true, message: simulated ? `Test – an ${name} wurde nichts gesendet.` : `Test-Nachricht an ${name} gesendet. Schau auf LinkedIn nach, ob sie angekommen ist.` };
      return response;
    } catch (error) {
      if (error instanceof LinkedInError) return sendError(reply, error.status, error.code, error.message, error.retryAfter);
      throw error;
    }
  });

  app.post('/api/linkedin/test-connect', async (request, reply) => {
    const body = TestConnectSchema.safeParse(request.body ?? {});
    if (!body.success) return sendError(reply, 400, 'invalid_request', body.error.issues.map((issue) => issue.message).join(' '));
    const user = request.authUser;
    if (user && user.founder !== body.data.founder) return sendError(reply, 403, 'not_allowed', ROLE_MESSAGES.linkedinOwnAccount);
    try {
      const { name } = await linkedin.testConnect(body.data.founder, body.data.message);
      const simulated = linkedin.mode === 'mock';
      if (!simulated) request.log.info({ founder: body.data.founder, by: request.authUser?.username }, 'LinkedIn-Test-Vernetzungsanfrage gesendet');
      const response: LinkedInTestConnectResponse = {
        ok: true,
        message: simulated ? `Test – an ${name} wurde keine Anfrage gesendet.` : `Test-Vernetzungsanfrage an ${name} gesendet. Schau auf LinkedIn nach, ob sie angekommen ist.`,
      };
      return response;
    } catch (error) {
      if (error instanceof LinkedInError) return sendError(reply, error.status, error.code, error.message, error.retryAfter);
      throw error;
    }
  });

  app.post('/api/linkedin/resume', async (request, reply) => {
    const body = ResumeSchema.safeParse(request.body ?? {});
    if (!body.success) return sendError(reply, 400, 'invalid_request', body.error.issues.map((issue) => issue.message).join(' '));
    // Mitarbeiter nur für den eigenen Gründer; Gründer und Admin für beide.
    const denied = assistantDenial(request.authUser ?? null, body.data.founder, (id) => linkedin.founderName(id));
    if (denied) return sendError(reply, 403, 'not_allowed', denied);
    return linkedin.resume(body.data.founder);
  });

  app.post('/api/leads/:id/linkedin/invite', async (request, reply) => {
    const params = IdParams.safeParse(request.params);
    if (!params.success) return sendError(reply, 404, 'not_found', 'Lead nicht gefunden.');
    const body = InviteSchema.safeParse(request.body ?? {});
    if (!body.success) return sendError(reply, 400, 'invalid_request', body.error.issues.map((issue) => issue.message).join(' '));
    return handle(reply, params.data.id, () => linkedin.invite(params.data.id, actingFounder(request.authUser), body.data.message, actorFor(request.authUser, actingFounder(request.authUser)), body.data.clientId));
  });

  app.post('/api/leads/:id/linkedin/message', async (request, reply) => {
    const params = IdParams.safeParse(request.params);
    if (!params.success) return sendError(reply, 404, 'not_found', 'Lead nicht gefunden.');
    const body = MessageSchema.safeParse(request.body ?? {});
    if (!body.success) return sendError(reply, 400, 'invalid_request', body.error.issues.map((issue) => issue.message).join(' '));
    return handle(reply, params.data.id, () => linkedin.message(params.data.id, actingFounder(request.authUser), body.data.text, body.data.label, actorFor(request.authUser, actingFounder(request.authUser)), body.data.clientId));
  });
}
