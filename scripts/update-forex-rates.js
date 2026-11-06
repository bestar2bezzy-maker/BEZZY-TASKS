
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is missing.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: true
  },
  max: 1,
  connectionTimeoutMillis: 15000
});

const CURRENCIES = [
  'AED', 'AOA', 'AUD', 'BIF', 'BRL', 'BWP',
  'CAD', 'CDF', 'CNY', 'CVE', 'DJF', 'DZD',
  'EGP', 'ERN', 'ETB', 'EUR', 'GHS', 'GMD',
  'GNF', 'ILS', 'INR', 'JPY', 'KES', 'KMF',
  'KRW', 'LRD', 'LSL', 'LYD', 'MAD', 'MGA',
  'MRU', 'MUR', 'MWK', 'MXN', 'MZN', 'NAD',
  'NGN', 'NZD', 'QAR', 'RWF', 'SAR', 'SCR',
  'SDG', 'SLE', 'SOS', 'SSP', 'STN', 'SZL',
  'TND', 'TZS', 'UGX', 'USD', 'XAF', 'XOF',
  'ZAR', 'ZMW', 'ZWG'
];

async function updateForexRates() {
  const response = await fetch(
    'https://open.er-api.com/v6/latest/XAF',
    {
      headers: {
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(20000)
    }
  );

  if (!response.ok) {
    throw new Error(`Exchange API HTTP ${response.status}`);
  }

  const data = await response.json();

  if (
    data.result !== 'success' ||
    data.base_code !== 'XAF' ||
    !data.rates ||
    !Number.isFinite(data.time_last_update_unix) ||
    !Number.isFinite(data.time_next_update_unix)
  ) {
    throw new Error('Invalid exchange API response.');
  }

  const fetchedAt = new Date(
    data.time_last_update_unix * 1000
  );

  const expiresAt = new Date(
    data.time_next_update_unix * 1000
  );

  const client = await pool.connect();

  let updated = 0;
  let skipped = 0;

  try {
    await client.query('BEGIN');

    for (const currency of CURRENCIES) {
      if (currency === 'XAF') {
        continue;
      }

      const unitsPerXaf = Number(data.rates[currency]);

      if (
        !Number.isFinite(unitsPerXaf) ||
        unitsPerXaf <= 0
      ) {
        skipped++;
        continue;
      }

      // API: unités étrangères pour 1 XAF.
      // Base de données: XAF pour 1 unité étrangère.
      const rateToXaf = 1 / unitsPerXaf;

      await client.query(
        `
        INSERT INTO public.forex_rates (
          currency_code,
          rate_to_xaf,
          source,
          is_active,
          fetched_at,
          expires_at,
          updated_at
        )
        VALUES ($1, $2, $3, TRUE, $4, $5, CURRENT_TIMESTAMP)
        ON CONFLICT (currency_code)
        DO UPDATE SET
          rate_to_xaf = EXCLUDED.rate_to_xaf,
          source = EXCLUDED.source,
          is_active = TRUE,
          fetched_at = EXCLUDED.fetched_at,
          expires_at = EXCLUDED.expires_at,
          updated_at = CURRENT_TIMESTAMP
        `,
        [
          currency,
          rateToXaf,
          'EXCHANGERATE_API_OPEN',
          fetchedAt,
          expiresAt
        ]
      );

      updated++;
    }

    await client.query('COMMIT');

    console.log('Forex update successful.');
    console.log(`Currencies updated: ${updated}`);
    console.log(`Currencies skipped: ${skipped}`);
    console.log(`Rates fetched at: ${fetchedAt.toISOString()}`);
    console.log(`Rates expire at: ${expiresAt.toISOString()}`);

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

updateForexRates()
  .catch((error) => {
    console.error('Forex update failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
