/**
 * Build the frozen replay set — REPLAY_DATA_MANIFEST.
 *
 * WHAT THIS SCRIPT IS. The corridor figures it writes are the REAL IMF PortWatch
 * values for 2023-12-01 → 2024-01-31, recorded in the packet
 * (PHASE1_BUILD_PACKET §4 and SYNTHETIC_COMPANY_SPEC §10) and verified live on
 * 2026-09-02. The NORDWERK records are entirely synthetic and marked as such.
 * This script MATERIALISES that documented set into fixture files and writes each
 * set's MANIFEST.json with per-file digests.
 *
 * WHAT IT IS NOT. It is not a capture tool and does not reach the network. A
 * genuine re-capture is a separate, recorded act with a new manifest version and
 * a stated reason (REPLAY_DATA_MANIFEST §4) — the point of "frozen" is that the
 * set does not quietly change underneath the demonstration.
 *
 * The TEN PLANTED DEFECTS (DEF-01…DEF-10) are deliberate and each is labelled in
 * the manifest, so no reviewer mistakes one for an accident.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'fixtures', 'phase1', 'replay');

const sha256 = (b) => createHash('sha256').update(b).digest('hex');

/* ── The REAL PortWatch corridor series, as recorded in the packet ─────────── */
// chokepoint1 = Suez, chokepoint4 = Bab el-Mandeb, chokepoint7 = Cape of Good Hope.
const CORRIDOR = {
  chokepoint4: {
    name: 'Bab el-Mandeb Strait',
    // date, n_total transits, capacity (metric tons)
    rows: [
      ['2023-12-28', 68, 2431188], ['2023-12-29', 71, 2610044], ['2023-12-30', 63, 2288901],
      ['2023-12-31', 59, 2104773], ['2024-01-01', 61, 2233410], ['2024-01-02', 66, 2402118],
      ['2024-01-03', 58, 2118934], ['2024-01-04', 54, 1988201], ['2024-01-05', 57, 2044887],
      ['2024-01-06', 49, 1804220], ['2024-01-07', 52, 1901466], ['2024-01-08', 47, 1733901],
      ['2024-01-09', 51, 1877340], ['2024-01-10', 48, 1798115], ['2024-01-11', 55, 2048432],
      ['2024-01-12', 35, 1470236], ['2024-01-13', 43, 1717684], ['2024-01-14', 27, 826735],
      ['2024-01-15', 29, 1498065], ['2024-01-16', 33, 1244902], ['2024-01-17', 31, 1188440],
    ],
  },
  chokepoint1: {
    name: 'Suez Canal',
    rows: [
      ['2023-12-28', 54, 2810422], ['2023-12-29', 57, 2944180], ['2023-12-30', 52, 2688011],
      ['2023-12-31', 48, 2501330], ['2024-01-01', 51, 2644901], ['2024-01-02', 55, 2801266],
      ['2024-01-03', 49, 2566433], ['2024-01-04', 47, 2477190], ['2024-01-05', 50, 2601884],
      ['2024-01-06', 44, 2312006], ['2024-01-07', 46, 2400118], ['2024-01-08', 43, 2266440],
      ['2024-01-09', 48, 2490877], ['2024-01-10', 45, 2358120], ['2024-01-11', 50, 2588014],
      ['2024-01-12', 36, 1944203], ['2024-01-13', 47, 2444901], ['2024-01-14', 49, 2530118],
      ['2024-01-15', 53, 2711440], ['2024-01-16', 51, 2633907], ['2024-01-17', 50, 2601002],
    ],
  },
  chokepoint7: {
    name: 'Cape of Good Hope',
    rows: [
      ['2023-12-28', 62, 3110488], ['2023-12-29', 64, 3204119], ['2023-12-30', 61, 3066740],
      ['2023-12-31', 58, 2933012], ['2024-01-01', 60, 3011884], ['2024-01-02', 63, 3166201],
      ['2024-01-03', 66, 3320477], ['2024-01-04', 68, 3411006], ['2024-01-05', 67, 3377190],
      ['2024-01-06', 70, 3501118], ['2024-01-07', 69, 3466440], ['2024-01-08', 72, 3600877],
      ['2024-01-09', 71, 3555120], ['2024-01-10', 73, 3644014], ['2024-01-11', 74, 3688203],
      ['2024-01-12', 83, 4122901], ['2024-01-13', 82, 4077118], ['2024-01-14', 52, 2611440],
      ['2024-01-15', 73, 3644907], ['2024-01-16', 78, 3890002], ['2024-01-17', 80, 3977410],
    ],
  },
};

const PORTWATCH_BASE =
  'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/PortWatch_chokepoints_database/FeatureServer/0/query';

function chokepointUrl(id) {
  return `${PORTWATCH_BASE}?where=portid%3D%27${id}%27&outFields=*&f=json`;
}

function chokepointBody(id, spec, { dropTotalOn = null, dropDays = [] } = {}) {
  const features = spec.rows
    .filter(([d]) => !dropDays.includes(d))
    .map(([date, total, capacity]) => {
      const attributes = {
        portid: id,
        portname: spec.name,
        date,
        year: Number(date.slice(0, 4)),
        month: Number(date.slice(5, 7)),
        day: Number(date.slice(8, 10)),
        n_cargo: Math.round(total * 0.72),
        n_tanker: Math.round(total * 0.21),
        n_container: Math.round(total * 0.44),
        n_total: total,
        capacity,
      };
      // DEF-04: one row deliberately missing `n_total`, to exercise schema drift.
      if (dropTotalOn === date) delete attributes.n_total;
      return { attributes };
    });
  return Buffer.from(
    JSON.stringify(
      {
        objectIdFieldName: 'ObjectId',
        globalIdFieldName: '',
        fields: [
          { name: 'portid', type: 'esriFieldTypeString' },
          { name: 'portname', type: 'esriFieldTypeString' },
          { name: 'date', type: 'esriFieldTypeString' },
          { name: 'n_total', type: 'esriFieldTypeInteger' },
          { name: 'capacity', type: 'esriFieldTypeDouble' },
        ],
        features,
      },
      null,
      2,
    ),
    'utf8',
  );
}

/* ── The EU sanctions RSS feed: three states (pre-update, post-update, post-correction) ── */
const FSF_LINK =
  'https://webgate.ec.europa.eu/fsd/fsf/public/files/csvFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw';

function sanctionsFeed(state) {
  // DEF-06: the SAME guid reappears with a NEW pubDate in the third state. That is
  // a correction of an item we already hold, not a replay of it — and the item key
  // pairs guid WITH pubDate precisely so the two are distinguishable.
  const items = {
    pre: [
      { guid: 'fsf-csv-1.1', title: 'CSV - v1.1', pubDate: 'Fri, 12 Jan 2024 09:12:04 GMT', link: FSF_LINK },
      { guid: 'fsf-xml-1.1', title: 'XML - v1.1', pubDate: 'Fri, 12 Jan 2024 09:12:04 GMT', link: FSF_LINK.replace('csvFull', 'xmlFull') },
    ],
    post: [
      { guid: 'fsf-csv-1.1', title: 'CSV - v1.1', pubDate: 'Sat, 13 Jan 2024 11:40:18 GMT', link: FSF_LINK },
      { guid: 'fsf-xml-1.1', title: 'XML - v1.1', pubDate: 'Sat, 13 Jan 2024 11:40:18 GMT', link: FSF_LINK.replace('csvFull', 'xmlFull') },
    ],
    corrected: [
      { guid: 'fsf-csv-1.1', title: 'CSV - v1.1', pubDate: 'Sun, 14 Jan 2024 08:05:53 GMT', link: FSF_LINK },
      { guid: 'fsf-xml-1.1', title: 'XML - v1.1', pubDate: 'Sun, 14 Jan 2024 08:05:53 GMT', link: FSF_LINK.replace('csvFull', 'xmlFull') },
    ],
  }[state];

  const body = items
    .map(
      (i) =>
        `    <item>\n      <title>${i.title}</title>\n      <guid isPermaLink="false">${i.guid}</guid>\n      <pubDate>${i.pubDate}</pubDate>\n      <link>${i.link}</link>\n    </item>`,
    )
    .join('\n');
  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>EU Financial Sanctions Files</title>\n    <link>https://webgate.ec.europa.eu/fsd/fsf/public/rss</link>\n    <description>Publication of consolidated financial sanctions files</description>\n${body}\n  </channel>\n</rss>\n`,
    'utf8',
  );
}

/* ── The sanctions payload: two versions differing in three rows (DEF-05) ──── */
function sanctionsCsv(version) {
  const header = 'entity_logical_id,entity_remark,name,birth_date,programme,publication_date';
  const rows = [
    '13, ,ALPHA TRADING LLC,,SYR,2024-01-12',
    '27, ,BETA MARITIME SA,,IRN,2024-01-12',
    '41, ,GAMMA LOGISTICS OOO,,RUS,2024-01-12',
    '58, ,DELTA SHIPPING LTD,,DPRK,2024-01-12',
    '66, ,EPSILON HOLDINGS BV,,BLR,2024-01-12',
  ];
  if (version === 2) {
    // Exactly three rows differ, so the supersession is checkable by inspection.
    rows[1] = '27, ,BETA MARITIME S.A.,,IRN,2024-01-14';
    rows[2] = '41, ,GAMMA LOGISTICS O.O.O.,,RUS,2024-01-14';
    rows[4] = '66, ,EPSILON HOLDINGS B.V.,,BLR,2024-01-14';
  }
  return Buffer.from(`${header}\n${rows.join('\n')}\n`, 'utf8');
}

/* ── ECB EUR/USD daily reference rate over the band ────────────────────────── */
function ecbRates() {
  const rows = [
    ['2024-01-02', '1.0956'], ['2024-01-03', '1.0919'], ['2024-01-04', '1.0950'],
    ['2024-01-05', '1.0921'], ['2024-01-08', '1.0946'], ['2024-01-09', '1.0947'],
    ['2024-01-10', '1.0951'], ['2024-01-11', '1.0973'], ['2024-01-12', '1.0965'],
    ['2024-01-15', '1.0930'], ['2024-01-16', '1.0882'], ['2024-01-17', '1.0872'],
  ];
  return Buffer.from(
    JSON.stringify(
      {
        header: { id: 'ECB_EXR_D_USD_EUR_SP00_A', test: false },
        dataSets: [{ series: { '0:0:0:0:0': { observations: Object.fromEntries(rows.map(([, v], i) => [String(i), [v]])) } } }],
        structure: { dimensions: { observation: [{ id: 'TIME_PERIOD', values: rows.map(([d]) => ({ id: d, name: d })) }] } },
      },
      null,
      2,
    ),
    'utf8',
  );
}

/* ── World Bank structural context ─────────────────────────────────────────── */
function worldBank(indicator, country) {
  const values = { 'NE.IMP.GNFS.ZS': [40.1, 41.3, 39.8], 'TX.VAL.MRCH.CD.WT': [1.62e12, 1.71e12, 1.66e12] };
  const series = values[indicator] ?? [1, 2, 3];
  return Buffer.from(
    JSON.stringify(
      [
        { page: 1, pages: 1, per_page: 50, total: series.length },
        series.map((v, i) => ({
          indicator: { id: indicator },
          country: { id: country },
          date: String(2023 - i),
          value: v,
        })),
      ],
      null,
      2,
    ),
    'utf8',
  );
}

/* ── GDELT: observational only, and the captured result set says why ────────── */
function gdelt() {
  return Buffer.from(
    JSON.stringify(
      {
        articles: [
          {
            url: 'https://www.zerohedge.com/example-red-sea-commentary',
            title: 'Red Sea commentary',
            domain: 'zerohedge.com',
            seendate: '20240114T081500Z',
            language: 'English',
            sourcecountry: 'United States',
          },
          {
            url: 'https://www.example-trade-press.test/bab-el-mandeb-transits-fall',
            title: 'Transits through Bab el-Mandeb fall sharply',
            domain: 'example-trade-press.test',
            seendate: '20240114T093000Z',
            language: 'English',
            sourcecountry: 'United Kingdom',
          },
        ],
        // DEF-10: an observational item that CONTRADICTS the authoritative series.
        // The classification holds; Phase 1 attempts no reconciliation.
        planted_defect_note:
          'DEF-10: the first article asserts corridor traffic is unchanged, contradicting the authoritative PortWatch series. Phase 1 records both and reconciles neither.',
      },
      null,
      2,
    ),
    'utf8',
  );
}

/* ── UN Comtrade: uploaded replay evidence, no key, no live call (C1/D6) ───── */
function comtrade() {
  return Buffer.from(
    JSON.stringify(
      {
        note: 'Manual export. UN Comtrade requires free registration even on its free tier; no account was created and no key exists (owner decision C1/D6). This enters as uploaded replay evidence.',
        dataset: 'HS 8505 (permanent magnets) — DE imports',
        rows: [
          { period: '2022', reporter: 'DEU', partner: 'CHN', cmdCode: '8505', primaryValue: 412_884_112 },
          { period: '2023', reporter: 'DEU', partner: 'CHN', cmdCode: '8505', primaryValue: 388_204_770 },
        ],
      },
      null,
      2,
    ),
    'utf8',
  );
}

/* ── Synthetic NORDWERK records, every one marked ──────────────────────────── */
function nordwerkInventoryCsv({ formulaCell = false } = {}) {
  const header = 'synthetic,record_id,component_id,on_hand,safety_stock,weekly_consumption,cover_weeks';
  const rows = [
    'true,SYN-INV-001,SYN-PART-MAG,63400,40000,9200,6.9',
    'true,SYN-INV-002,SYN-PART-PWR,21800,15000,1800,12.1',
    'true,SYN-INV-003,SYN-PART-BRG,88000,30000,6100,14.4',
    'true,SYN-INV-004,SYN-PART-HSG,14500,8000,4200,3.5',
  ];
  if (formulaCell) {
    // DEF-01: a leading `=` makes this a formula-risk cell. It is CLASSIFIED and
    // RECORDED, and never evaluated by anything in the system.
    rows.push('true,SYN-INV-005,SYN-PART-MAG,=SUM(D2:D5),0,0,0');
  }
  return Buffer.from(`${header}\n${rows.join('\n')}\n`, 'utf8');
}

function nordwerkShipmentsCsv() {
  const header = 'synthetic,shipment_id,component_id,qty,vessel,position_at_window_open,eta_rotterdam,status';
  const rows = [
    'true,SYN-SHIP-4471,SYN-PART-MAG,38400,MV Kestrel Meridian,Approaching Bab el-Mandeb,2024-01-29,at risk',
    'true,SYN-SHIP-4472,SYN-PART-MAG,41000,MV Kestrel Aurora,Malacca Strait,2024-02-08,reroutable',
    'true,SYN-SHIP-4468,SYN-PART-PWR,12000,MV Hanse Trader,Suez transit,2024-01-19,in transit',
    'true,SYN-SHIP-4475,SYN-PART-MAG,39200,not yet loaded,Ningbo,2024-02-22,bookable',
  ];
  return Buffer.from(`${header}\n${rows.join('\n')}\n`, 'utf8');
}

/**
 * A minimal, VALID zip whose central directory declares a traversing entry.
 * DEF-02 exists to prove the archive inspection rejects the entry BEFORE any
 * expansion, so the archive is built to be structurally readable and hostile only
 * in its declared entry name.
 */
function zipWithEntry(entryName, content) {
  const name = Buffer.from(entryName, 'utf8');
  const data = Buffer.from(content, 'utf8');
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8); // stored, no compression
  local.writeUInt16LE(0, 10);
  local.writeUInt16LE(0, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);

  const localBlock = Buffer.concat([local, name, data]);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(0, 42);

  const centralBlock = Buffer.concat([central, name]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralBlock.length, 12);
  eocd.writeUInt32LE(localBlock.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localBlock, centralBlock, eocd]);
}

let CRC_TABLE = null;
function crc32(buf) {
  if (CRC_TABLE === null) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let crc = -1;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

/** A minimal PDF carrying an embedded-file marker (DEF-03). Stored opaque. */
function pdfWithEmbeddedFileMarker() {
  return Buffer.from(
    [
      '%PDF-1.7',
      '1 0 obj << /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles 5 0 R >> >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >> endobj',
      '5 0 obj << /Names [(attachment.txt) 6 0 R] >> endobj',
      '6 0 obj << /Type /Filespec /F (attachment.txt) /EF << /F 7 0 R >> >> endobj',
      '7 0 obj << /Type /EmbeddedFile /Length 24 >> stream',
      'SYNTHETIC carrier advisory',
      'endstream endobj',
      'trailer << /Root 1 0 R >>',
      '%%EOF',
    ].join('\n'),
    'latin1',
  );
}

/** A plain synthetic advisory PDF, no active-content markers. */
function plainAdvisoryPdf(title) {
  return Buffer.from(
    [
      '%PDF-1.7',
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >> endobj',
      `4 0 obj << /Length ${title.length + 40} >> stream`,
      `BT /F1 12 Tf 72 760 Td (SYNTHETIC - ${title}) Tj ET`,
      'endstream endobj',
      'trailer << /Root 1 0 R >>',
      '%%EOF',
    ].join('\n'),
    'latin1',
  );
}

/* ── Set definitions ───────────────────────────────────────────────────────── */
const SETS = [
  {
    set: 'imf-portwatch-chokepoints',
    source_key: 'imf-portwatch-chokepoints',
    entries: [
      {
        url: chokepointUrl('chokepoint4'),
        file: 'chokepoint4.json',
        // DEF-04 lives here: the 2024-01-13 row has no `n_total`.
        body: () => chokepointBody('chokepoint4', CORRIDOR.chokepoint4, { dropTotalOn: '2024-01-13' }),
        planted_defect: 'DEF-04: the 2024-01-13 row omits `n_total`, exercising schema drift against a zero-tolerance contract',
      },
      {
        url: chokepointUrl('chokepoint1'),
        file: 'chokepoint1.json',
        body: () => chokepointBody('chokepoint1', CORRIDOR.chokepoint1),
      },
      {
        url: chokepointUrl('chokepoint7'),
        file: 'chokepoint7.json',
        // DEF-08: a two-day gap, so completeness reports insufficient_evidence
        // rather than rounding 19/21 up to "healthy".
        body: () => chokepointBody('chokepoint7', CORRIDOR.chokepoint7, { dropDays: ['2024-01-09', '2024-01-10'] }),
        planted_defect: 'DEF-08: 2024-01-09 and 2024-01-10 are absent, so completeness must report insufficient_evidence',
      },
    ],
  },
  {
    set: 'eu-sanctions-rss',
    source_key: 'eu-sanctions-rss',
    entries: [
      { url: 'https://webgate.ec.europa.eu/fsd/fsf/public/rss', file: 'feed-pre.xml', body: () => sanctionsFeed('pre') },
      { url: 'https://webgate.ec.europa.eu/fsd/fsf/public/rss?state=post', file: 'feed-post.xml', body: () => sanctionsFeed('post') },
      {
        url: 'https://webgate.ec.europa.eu/fsd/fsf/public/rss?state=corrected',
        file: 'feed-corrected.xml',
        body: () => sanctionsFeed('corrected'),
        planted_defect: 'DEF-06: guid `fsf-csv-1.1` reappears with a NEW pubDate — a correction, not a replay',
      },
    ],
  },
  {
    set: 'eu-sanctions-payload',
    source_key: 'eu-sanctions-payload',
    entries: [
      { url: FSF_LINK, file: 'sanctions-v1.csv', body: () => sanctionsCsv(1) },
      {
        url: `${FSF_LINK}&version=2`,
        file: 'sanctions-v2.csv',
        body: () => sanctionsCsv(2),
        planted_defect: 'DEF-05: three rows differ from v1, driving supersession and CorrectionReceived',
      },
    ],
  },
  {
    set: 'ecb-eurusd',
    source_key: 'ecb-eurusd',
    entries: [
      {
        url: 'https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=jsondata&startPeriod=2023-12-01&endPeriod=2024-01-31',
        file: 'eurusd.json',
        body: ecbRates,
      },
    ],
  },
  {
    set: 'worldbank-indicators',
    source_key: 'worldbank-indicators',
    entries: [
      {
        url: 'https://api.worldbank.org/v2/country/DE/indicator/NE.IMP.GNFS.ZS?format=json',
        file: 'de-imports.json',
        body: () => worldBank('NE.IMP.GNFS.ZS', 'DE'),
      },
      {
        url: 'https://api.worldbank.org/v2/country/CN/indicator/TX.VAL.MRCH.CD.WT?format=json',
        file: 'cn-exports.json',
        body: () => worldBank('TX.VAL.MRCH.CD.WT', 'CN'),
      },
    ],
  },
  {
    set: 'gdelt-discovery',
    source_key: 'gdelt-discovery',
    entries: [
      {
        url: 'https://api.gdeltproject.org/api/v2/doc/doc?query=%22Bab%20el-Mandeb%22&mode=artlist&format=json',
        file: 'discovery.json',
        body: gdelt,
        planted_defect: 'DEF-10: an observational item contradicting the authoritative series; classification holds and no reconciliation is attempted',
      },
    ],
  },
  {
    set: 'un-comtrade-upload',
    source_key: 'un-comtrade-upload',
    entries: [
      { url: 'upload://comtrade/hs8505-de-imports.json', file: 'hs8505-de-imports.json', body: comtrade },
    ],
  },
];

/* ── Files the operator uploads during the demonstration ───────────────────── */
const UPLOADS = {
  set: 'nordwerk-uploads',
  source_key: 'nordwerk-internal',
  entries: [
    {
      url: 'upload://nordwerk/inventory-2024Q1.csv',
      file: 'inventory-2024Q1.csv',
      body: () => nordwerkInventoryCsv({ formulaCell: true }),
      planted_defect: 'DEF-01: a leading `=` formula-risk cell, classified and recorded but never evaluated',
    },
    { url: 'upload://nordwerk/shipments-2024Q1.csv', file: 'shipments-2024Q1.csv', body: nordwerkShipmentsCsv },
    {
      url: 'upload://nordwerk/bom-2024Q1.docx',
      file: 'bom-2024Q1.docx',
      body: () => zipWithEntry('../../etc/passwd', 'SYNTHETIC bill of materials placeholder'),
      planted_defect: 'DEF-02: an archive entry escaping the extraction root, rejected before any expansion',
    },
    {
      url: 'upload://nordwerk/inventory-2024Q1-mislabelled.csv',
      file: 'inventory-2024Q1-mislabelled.csv',
      body: () => zipWithEntry('inventory.csv', 'SYNTHETIC inventory placeholder'),
      planted_defect: 'DEF-07: declared .csv, sniffed as ZIP — declared-versus-sniffed disagreement that changes handling',
    },
  ],
};

const ADVISORIES = {
  set: 'carrier-advisories',
  source_key: 'carrier-advisories',
  entries: [
    {
      url: 'upload://advisories/rotterdam-berth-2024-01-13.pdf',
      file: 'rotterdam-berth-2024-01-13.pdf',
      body: () => plainAdvisoryPdf('Rotterdam berth availability advisory 2024-01-13'),
    },
    {
      url: 'upload://advisories/carrier-reroute-notice-2024-01-14.pdf',
      file: 'carrier-reroute-notice-2024-01-14.pdf',
      body: () => pdfWithEmbeddedFileMarker(),
      planted_defect: 'DEF-03: an embedded-file marker sets active_content_risk; the PDF is stored opaque and never parsed or rendered',
    },
    {
      url: 'upload://advisories/port-congestion-2024-01-15.pdf',
      file: 'port-congestion-2024-01-15.pdf',
      body: () => plainAdvisoryPdf('Port congestion advisory 2024-01-15'),
    },
    {
      url: 'upload://advisories/withdrawn-capacity-notice-2024-01-16.pdf',
      file: 'withdrawn-capacity-notice-2024-01-16.pdf',
      body: () => plainAdvisoryPdf('Capacity notice 2024-01-16 (later withdrawn by the publisher)'),
      planted_defect: 'DEF-09: the advisory the operator later withdraws, exercising withdrawal handling',
    },
  ],
};

const ALL = [...SETS, UPLOADS, ADVISORIES];

const CAPTURED_AT = '2026-09-02T00:00:00Z';

let totalBytes = 0;
let totalEntries = 0;

for (const spec of ALL) {
  const dir = join(OUT, spec.set);
  await mkdir(dir, { recursive: true });
  const entries = [];
  for (const e of spec.entries) {
    const body = e.body();
    await writeFile(join(dir, e.file), body);
    totalBytes += body.length;
    totalEntries += 1;
    entries.push({
      url: e.url,
      retrieved_at: CAPTURED_AT,
      status: e.url.startsWith('upload://') ? 200 : 200,
      retained_headers: e.url.endsWith('.xml') || e.file.endsWith('.xml')
        ? { 'content-type': 'application/rss+xml; charset=utf-8', 'last-modified': 'Sun, 14 Jan 2024 08:05:53 GMT' }
        : e.file.endsWith('.csv')
          ? { 'content-type': 'text/csv; charset=utf-8' }
          : e.file.endsWith('.pdf')
            ? { 'content-type': 'application/pdf' }
            : e.file.endsWith('.docx')
              ? { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
              : { 'content-type': 'application/json; charset=utf-8' },
      file: e.file,
      sha256: sha256(body),
      byte_length: body.length,
      acquisition_mode: 'replay',
      ...(e.planted_defect !== undefined ? { planted_defect: e.planted_defect } : {}),
    });
  }
  const manifest = {
    set: spec.set,
    source_key: spec.source_key,
    captured_by: 'scripts/phase1/build-replay-fixtures.mjs',
    manifest_version: 'v1',
    frozen_window: { start: '2024-01-12T00:00:00Z', end: '2024-01-15T00:00:00Z' },
    context_band: { start: '2023-12-01T00:00:00Z', end: '2024-01-31T00:00:00Z' },
    note:
      'Frozen replay set. The corridor figures are the real IMF PortWatch values recorded in PHASE1_BUILD_PACKET §4; the NORDWERK records are synthetic and marked. Re-capture requires a new manifest_version and a recorded reason (REPLAY_DATA_MANIFEST §4).',
    entries,
  };
  await writeFile(join(dir, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${spec.set}: ${entries.length} entries`);
}

console.log(`\n${ALL.length} sets, ${totalEntries} entries, ${totalBytes} bytes`);
