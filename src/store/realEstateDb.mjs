import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_DB_PATH = 'data/real-estate.sqlite';

const dbCache = new Map();

export function getRealEstateDb(config = {}) {
  const configuredPath = config?.real_estate?.db_path ?? process.env.REAL_ESTATE_DB_PATH ?? DEFAULT_DB_PATH;
  const dbPath = process.env.CHANNEL_AGENT_DATA_DIR
    ? resolve(process.env.CHANNEL_AGENT_DATA_DIR, configuredPath.split('/').pop() ?? DEFAULT_DB_PATH)
    : resolve(configuredPath);

  const cached = dbCache.get(dbPath);
  if (cached) return cached;

  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  seedListings(db);
  dbCache.set(dbPath, db);
  return db;
}

export function searchListings({ request, config, limit = 3 }) {
  const conn = getRealEstateDb(config);
  const city = normalize(request.city);
  const district = normalize(request.district);
  const room_type = normalize(request.room_type || '');
  const bedrooms = Number(request.bedrooms);
  const maxBudget = Number(request.max_budget_eur);
  const minSize = Number(request.min_size);
  const features = request.features || [];
  const developmentType = normalize(request.development_type || '');

  let rows = conn
    .prepare(
      `SELECT id, title, city, district, room_type, bedrooms, price_eur, size_sqm, address, url, status, notes, features, development
       FROM listings
       WHERE status = 'available'
       ORDER BY price_eur ASC`,
    )
    .all();

  if (city && city !== 'unknown') rows = rows.filter((row) => normalize(row.city).includes(city));
  if (district && district !== 'unknown') rows = rows.filter((row) => normalize(row.district).includes(district));
  if (room_type && room_type !== 'unknown') rows = rows.filter((row) => {
    const rowRoomType = normalize(row.room_type || '');
    return rowRoomType.includes(room_type.replace('-izb', '')) || rowRoomType === room_type;
  });
  if (Number.isFinite(bedrooms)) rows = rows.filter((row) => Number(row.bedrooms) === bedrooms);
  if (Number.isFinite(maxBudget)) rows = rows.filter((row) => Number(row.price_eur) <= maxBudget);
  if (Number.isFinite(minSize)) rows = rows.filter((row) => Number(row.size_sqm) >= minSize);
  if (developmentType && developmentType !== 'unknown') rows = rows.filter((row) => normalize(row.development || '').includes(developmentType));

  // Filter by features if requested
  if (features.length > 0) {
    rows = rows.filter((row) => {
      const rowFeatures = normalize(row.features || '');
      return features.some((f) => rowFeatures.includes(normalize(f)));
    });
  }

  return rows.slice(0, limit);
}

export function logConversation({ message, request, listings, reply, config }) {
  const conn = getRealEstateDb(config);
  const inserted = conn
    .prepare(
      `INSERT INTO conversations
       (channel, sender_id, sender_name, raw_message, intent, language, city, district, room_type,
        bedrooms, max_budget_eur, features, development_type, occupants, move_in_date, listing_ids, reply)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      message.channel,
      String(message.sender?.id ?? message.sender?.handle ?? ''),
      message.sender?.name ?? message.sender?.handle ?? 'unknown',
      message.text,
      request.intent,
      request.language || 'en',
      request.city,
      request.district,
      request.room_type || '',
      request.bedrooms,
      request.max_budget_eur,
      Array.isArray(request.features) ? request.features.join(', ') : (request.features || ''),
      request.development_type || '',
      String(request.occupants || ''),
      request.move_in_date || '',
      JSON.stringify(listings.map((listing) => listing.id)),
      reply,
    );
  return { id: inserted.lastInsertRowid, stored: true };
}

export function createViewing({ message, request, listings, config }) {
  if (request.intent !== 'viewing_request') {
    return { status: 'not_needed' };
  }
  const listing = listings[0];
  if (!listing) {
    return { status: 'needs_listing_match' };
  }

  const conn = getRealEstateDb(config);
  const inserted = conn
    .prepare(
      `INSERT INTO viewings
       (listing_id, requester_name, requester_contact, requested_time, status, source_message)
       VALUES (?, ?, ?, ?, 'pending_confirmation', ?)`,
    )
    .run(
      listing.id,
      message.sender?.name ?? 'unknown',
      message.sender?.phone ?? message.sender?.handle ?? String(message.sender?.id ?? ''),
      request.requested_time,
      message.text,
    );

  return {
    status: 'pending_confirmation',
    viewing_id: inserted.lastInsertRowid,
    listing_id: listing.id,
    requested_time: request.requested_time,
  };
}

export function getRealEstateDigest(config = {}) {
  const conn = getRealEstateDb(config);
  const listings = conn.prepare("SELECT COUNT(*) AS count FROM listings WHERE status = 'available'").get();
  const conversations = conn.prepare('SELECT COUNT(*) AS count FROM conversations').get();
  const pendingViewings = conn.prepare("SELECT COUNT(*) AS count FROM viewings WHERE status = 'pending_confirmation'").get();
  const recent = conn
    .prepare(
      `SELECT c.created_at, c.intent, c.language, c.sender_name, c.district,
              c.bedrooms, c.max_budget_eur, c.features, c.raw_message, c.reply
       FROM conversations c
       ORDER BY c.created_at DESC
       LIMIT 5`,
    )
    .all();
  const upcoming = conn
    .prepare(
      `SELECT v.id, v.requested_time, v.status, l.title, l.url
       FROM viewings v
       JOIN listings l ON l.id = v.listing_id
       ORDER BY v.created_at DESC
       LIMIT 5`,
    )
    .all();
  // Interest by district
  const districtInterest = conn
    .prepare(
      `SELECT district, COUNT(*) AS count FROM conversations
       WHERE district IS NOT NULL AND district != 'unknown'
       GROUP BY district ORDER BY count DESC LIMIT 5`,
    )
    .all();

  return {
    available_listings: listings.count,
    conversations: conversations.count,
    pending_viewings: pendingViewings.count,
    popular_districts: districtInterest,
    recent,
    upcoming,
  };
}

function migrate(conn) {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS listings (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      city TEXT NOT NULL,
      district TEXT NOT NULL,
      room_type TEXT,
      bedrooms INTEGER NOT NULL,
      price_eur INTEGER NOT NULL,
      size_sqm INTEGER,
      address TEXT,
      url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available',
      features TEXT,
      development TEXT,
      floor TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY,
      channel TEXT NOT NULL,
      sender_id TEXT,
      sender_name TEXT,
      raw_message TEXT NOT NULL,
      intent TEXT,
      language TEXT DEFAULT 'en',
      city TEXT,
      district TEXT,
      room_type TEXT,
      bedrooms TEXT,
      max_budget_eur TEXT,
      min_size TEXT,
      features TEXT,
      development_type TEXT,
      occupants TEXT,
      move_in_date TEXT,
      listing_ids TEXT,
      reply TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS viewings (
      id INTEGER PRIMARY KEY,
      listing_id INTEGER NOT NULL REFERENCES listings(id),
      requester_name TEXT,
      requester_contact TEXT,
      requested_time TEXT,
      status TEXT NOT NULL DEFAULT 'pending_confirmation',
      source_message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

function seedListings(conn) {
  const row = conn.prepare('SELECT COUNT(*) AS count FROM listings').get();
  if (row.count > 0) return;

  const listings = [
    {
      title: '2i byt Miletičova, blízko Nivy',
      city: 'Bratislava', district: 'Ružinov', room_type: '2-izb', bedrooms: 2,
      price_eur: 850, size_sqm: 54,
      address: 'Miletičova, Bratislava',
      features: 'balkón, výťah, kúrenie, pivnica',
      development: 'novostavba', floor: '5',
      url: 'https://www.nehnutelnosti.sk/bratislava-ruzinov/2-izbove-byty/prenajom/',
      notes: 'Vhodné pre pracujúcich, rýchly prístup do centra a k Nivy.',
    },
    {
      title: '2i byt Staré Mesto, centrum',
      city: 'Bratislava', district: 'Staré Mesto', room_type: '2-izb', bedrooms: 2,
      price_eur: 980, size_sqm: 58,
      address: 'Staré Mesto, Bratislava',
      features: 'balkón, výťah, klíma, parkovanie',
      development: 'rekonštrukcia', floor: '3',
      url: 'https://www.nehnutelnosti.sk/bratislava-stare-mesto/2-izbove-byty/prenajom/',
      notes: 'Centrálna lokalita, pešo do centra.',
    },
    {
      title: '3i byt Petržalka, rodinný',
      city: 'Bratislava', district: 'Petržalka', room_type: '3-izb', bedrooms: 3,
      price_eur: 1050, size_sqm: 72,
      address: 'Petržalka, Bratislava',
      features: 'balkón, terasa, parkovanie, pivnica',
      development: 'novostavba', floor: '2',
      url: 'https://www.nehnutelnosti.sk/bratislava-petrzalka/3-izbove-byty/prenajom/',
      notes: 'Priestranný byt vhodný pre pár alebo malú rodinu.',
    },
    {
      title: '1i garçonka Dúbravka, zariadená',
      city: 'Bratislava', district: 'Dúbravka', room_type: '1-izb', bedrooms: 1,
      price_eur: 620, size_sqm: 32,
      address: 'Dúbravka, Bratislava',
      features: 'zariadený, kúrenie, výťah',
      development: 'novostavba', floor: '8',
      url: 'https://www.nehnutelnosti.sk/bratislava-dubravka/1-izbove-byty/prenajom/',
      notes: 'Malý byt pre jednotlivca, kompletne zariadený.',
    },
    {
      title: '2i byt Karlova Ves, s balkónom',
      city: 'Bratislava', district: 'Karlova Ves', room_type: '2-izb', bedrooms: 2,
      price_eur: 780, size_sqm: 50,
      address: 'Karlova Ves, Bratislava',
      features: 'balkón, parkovanie, kúrenie',
      development: 'novostavba', floor: '4',
      url: 'https://www.nehnutelnosti.sk/bratislava-karlova-ves/2-izbove-byty/prenajom/',
      notes: 'Pokojná lokalita blízko lesa, vhodné pre páry.',
    },
    {
      title: '4i byt Nové Mesto, veľký rodinný',
      city: 'Bratislava', district: 'Nové Mesto', room_type: '4-izb', bedrooms: 4,
      price_eur: 1350, size_sqm: 95,
      address: 'Nové Mesto, Bratislava',
      features: 'balkón, terasa, parkovanie, výťah, klíma, pivnica',
      development: 'novostavba', floor: '7',
      url: 'https://www.nehnutelnosti.sk/bratislava-nove-mesto/4-izbove-byty/prenajom/',
      notes: 'Veľký byt pre rodinu, všetky vymoženosti.',
    },
    {
      title: '2i byt Rača, s parkovaním',
      city: 'Bratislava', district: 'Rača', room_type: '2-izb', bedrooms: 2,
      price_eur: 720, size_sqm: 55,
      address: 'Rača, Bratislava',
      features: 'parkovanie, kúrenie, pivnica',
      development: 'staršia', floor: '1',
      url: 'https://www.nehnutelnosti.sk/bratislava-raca/2-izbove-byty/prenajom/',
      notes: 'Lacnejšia alternatíva, dobré spojenie MHD.',
    },
    {
      title: '3i byt Petržalka, s terasou',
      city: 'Bratislava', district: 'Petržalka', room_type: '3-izb', bedrooms: 3,
      price_eur: 980, size_sqm: 68,
      address: 'Petržalka, Bratislava',
      features: 'terasa, parkovanie, klíma, zariadený',
      development: 'novostavba', floor: '6',
      url: 'https://www.nehnutelnosti.sk/bratislava-petrzalka/3-izbove-byty/prenajom/',
      notes: 'S terasou, zariadený, ihneď voľný.',
    },
  ];

  const stmt = conn.prepare(
    `INSERT INTO listings
     (title, city, district, room_type, bedrooms, price_eur, size_sqm, address, features, development, floor, url, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const listing of listings) {
    stmt.run(
      listing.title, listing.city, listing.district, listing.room_type,
      listing.bedrooms, listing.price_eur, listing.size_sqm,
      listing.address, listing.features, listing.development, listing.floor,
      listing.url, listing.notes,
    );
  }
}

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}
