import type { MetaAdsCheck } from '../../../shared/leadSearch.js';

/**
 * Auswertung der Meta-Werbebibliothek (Ad Library API, `GET /ads_archive`) – für Simulation und Live gleich.
 *
 * Die Suche läuft über den Firmennamen. Treffer anderer Werbetreibender („Fremdtreffer“, z. B. ein Makler,
 * der dasselbe Projekt bewirbt) zählen nicht: Eigene Anzeigen erkennt der Abgleich am Seitennamen oder an der
 * Website-Domain im Link der Anzeige.
 */

/** Land, in dem die Anzeigen ausgespielt wurden. Für die EU liefert Meta alle Anzeigen (DSA), nicht nur politische. */
export const ADS_COUNTRY = 'DE';

/** Felder, die wir je Anzeige abfragen. */
export const ARCHIVED_AD_FIELDS = [
  'id',
  'page_id',
  'page_name',
  'ad_delivery_start_time',
  'ad_delivery_stop_time',
  'ad_creative_link_captions',
] as const;

/** Eine Anzeige aus `GET /ads_archive` (nur die abgefragten Felder). */
export interface ArchivedAd {
  id: string;
  page_id?: string;
  page_name?: string;
  ad_delivery_start_time?: string;
  /** Fehlt, solange die Anzeige läuft. */
  ad_delivery_stop_time?: string;
  ad_creative_link_captions?: string[];
}

/** Firmenangaben aus dem LinkedIn-Profil. */
export interface CompanyRef {
  name: string;
  website: string | null;
}

/** Rechtsformen und Füllwörter, die im Namen nichts unterscheiden. */
const LEGAL_TOKENS = new Set([
  'gmbh',
  'mbh',
  'ug',
  'haftungsbeschraenkt',
  'ag',
  'kg',
  'kgaa',
  'ohg',
  'gbr',
  'se',
  'ek',
  'ev',
  'eg',
  'partg',
  'mbb',
  'co',
  'ltd',
  'llc',
  'inc',
  'bv',
  'und',
  'and',
]);

/** Branchenwörter: Sie allein machen zwei Namen nicht zur selben Firma. */
const GENERIC_TOKENS = new Set([
  'immobilien',
  'immobilie',
  'immo',
  'anlageimmobilien',
  'kapitalimmobilien',
  'vermoegensimmobilien',
  'kapitalanlage',
  'kapitalanlagen',
  'kapital',
  'capital',
  'invest',
  'investment',
  'investments',
  'real',
  'estate',
  'estates',
  'wohnbau',
  'wohnungsbau',
  'wohnen',
  'wohnprojekte',
  'bau',
  'projektbau',
  'bautraeger',
  'projekt',
  'projekte',
  'projektentwicklung',
  'development',
  'developments',
  'quartiersentwicklung',
  'gruppe',
  'group',
  'holding',
  'partner',
  'home',
  'homes',
  'haus',
  'finanz',
  'finance',
  'vermoegen',
  'management',
  'asset',
  'consulting',
  'service',
  'services',
  'vertrieb',
  'deutschland',
  'germany',
  'der',
  'die',
  'das',
  'fuer',
  'von',
  'the',
]);

function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
}

/** Bedeutungstragende Wörter eines Firmennamens – ohne Rechtsform. */
export function nameTokens(name: string): string[] {
  const folded = fold(name)
    // „e. K.“, „e.V.“, „& Co. KG“ zuerst als Ganzes entfernen
    .replace(/\be\.\s*(k|v)\b\.?/g, ' ')
    .replace(/&/g, ' ');
  return folded.split(/[^a-z0-9]+/).filter((token) => token && !LEGAL_TOKENS.has(token));
}

/** Suchbegriff für die Werbebibliothek: Firmenname ohne Rechtsform, z. B. „Muster Wohnbau“. */
export function companySearchTerm(name: string): string {
  const cleaned = name
    .replace(/\(haftungsbeschränkt\)/gi, ' ')
    .replace(/\b(GmbH|mbH|UG|AG|KGaA|KG|OHG|GbR|SE|e\.\s?K\.?|e\.\s?V\.?|eG|PartG|mbB|Ltd\.?|LLC|Inc\.?|B\.?V\.?)(?=$|[\s,.&)])/gi, ' ')
    .replace(/&\s*Co\.?/gi, ' ')
    .replace(/[|,;:()"„“”]+/g, ' ')
    .replace(/\s+&\s*$/, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 100);
}

/** Domain ohne Protokoll, „www.“ und Pfad – z. B. „muster-wohnbau.de“. */
export function domainOf(website: string | null | undefined): string | null {
  if (!website) return null;
  const host = website
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#:]/)[0];
  return host && host.includes('.') ? host : null;
}

/** Gehört die Anzeige zur Firma? Seitenname passt zum Firmennamen oder der Link führt auf die Firmen-Website. */
export function isOwnAd(ad: ArchivedAd, company: CompanyRef): boolean {
  const domain = domainOf(company.website);
  if (domain && (ad.ad_creative_link_captions ?? []).some((caption) => fold(caption).replace(/^www\./, '').includes(domain))) {
    return true;
  }
  if (!ad.page_name) return false;
  return sameCompany(ad.page_name, company.name);
}

export function sameCompany(pageName: string, companyName: string): boolean {
  const page = nameTokens(pageName);
  const company = nameTokens(companyName);
  if (!page.length || !company.length) return false;
  if (page.join(' ') === company.join(' ') || page.join('') === company.join('')) return true;
  // Sonst müssen die unterscheidenden Wörter (z. B. der Familienname) übereinstimmen.
  const pageDistinct = page.filter((token) => !GENERIC_TOKENS.has(token));
  const companyDistinct = company.filter((token) => !GENERIC_TOKENS.has(token));
  if (!pageDistinct.length || !companyDistinct.length) return false;
  const [shorter, longer] = pageDistinct.length <= companyDistinct.length ? [pageDistinct, companyDistinct] : [companyDistinct, pageDistinct];
  return shorter.every((token) => longer.includes(token));
}

function day(value: string | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Link in die öffentliche Werbebibliothek – zum Nachprüfen mit einem Klick. */
export function adLibraryUrl(target: { pageId?: string | null; term?: string | null }): string | null {
  const base = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${ADS_COUNTRY}`;
  if (target.pageId) return `${base}&view_all_page_id=${encodeURIComponent(target.pageId)}`;
  if (target.term) return `${base}&q=${encodeURIComponent(target.term)}&search_type=keyword_unordered&media_type=all`;
  return null;
}

/** Ergebnis ohne Prüfung – mit Link, damit man selbst nachsehen kann. */
export function uncheckedAds(note: string, companyName: string | null): MetaAdsCheck {
  const term = companyName ? companySearchTerm(companyName) : null;
  return {
    state: 'unchecked',
    advertiser: null,
    ads: 0,
    activeAds: 0,
    lastStop: null,
    foreignAds: 0,
    libraryUrl: adLibraryUrl({ term }),
    note,
  };
}

/**
 * Wertet die gefundenen Anzeigen aus: aktiv (läuft gerade) · beendet · keine eigenen Anzeigen.
 * Eine Anzeige gilt als aktiv, solange sie kein Enddatum hat oder das Enddatum heute oder später ist.
 */
export function evaluateAds(found: ArchivedAd[], company: CompanyRef, options: { today: Date; term: string }): MetaAdsCheck {
  const unique = [...new Map(found.map((ad) => [ad.id, ad])).values()];
  const own = unique.filter((ad) => isOwnAd(ad, company));
  const foreignAds = unique.length - own.length;
  const today = isoDay(options.today);

  if (!own.length) {
    return {
      state: 'none',
      advertiser: null,
      ads: 0,
      activeAds: 0,
      lastStop: null,
      foreignAds,
      libraryUrl: adLibraryUrl({ term: options.term }),
      note: foreignAds ? `Nur Fremdtreffer (${foreignAds} ${foreignAds === 1 ? 'Anzeige' : 'Anzeigen'} anderer Werbetreibender)` : null,
    };
  }

  const active = own.filter((ad) => {
    const stop = day(ad.ad_delivery_stop_time);
    return !stop || stop >= today;
  });
  // Häufigster Werbetreibender unter den eigenen Anzeigen
  const pages = new Map<string, { name: string; count: number }>();
  for (const ad of own) {
    const key = ad.page_id ?? ad.page_name ?? '';
    const entry = pages.get(key) ?? { name: ad.page_name ?? '', count: 0 };
    entry.count++;
    pages.set(key, entry);
  }
  const [pageId, page] = [...pages.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  const stops = own.map((ad) => day(ad.ad_delivery_stop_time)).filter((value): value is string => !!value);
  const lastStop = stops.length ? stops.sort().at(-1)! : null;

  return {
    state: active.length ? 'active' : 'stopped',
    advertiser: page.name || null,
    ads: own.length,
    activeAds: active.length,
    lastStop: active.length ? null : lastStop,
    foreignAds,
    libraryUrl: adLibraryUrl({ pageId: /^\d+$/.test(pageId) ? pageId : null, term: options.term }),
    note: null,
  };
}

/**
 * Meta-Ads-Stand von Hand (Lead-Panel, `UpdateLeadRequest.metaAds`): ersetzt die Prüfung der Lead-Suche. Behält den
 * Link in die Werbebibliothek zum Nachsehen; `manual` markiert die Herkunft.
 */
export function manualMetaAds(input: { state: 'none' | 'stopped' | 'active'; lastStop?: string | null }, companyName: string | null): MetaAdsCheck {
  const base = uncheckedAds('Von Hand eingetragen', companyName);
  const lastStop = input.state === 'stopped' && input.lastStop ? input.lastStop.slice(0, 10) : null;
  return {
    ...base,
    state: input.state,
    activeAds: input.state === 'active' ? 1 : 0,
    ads: input.state === 'none' ? 0 : 1,
    lastStop,
    manual: true,
  };
}
