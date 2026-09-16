#!/usr/bin/env ts-node
/**
 * Branded/restaurant-chain food catalog import script (Turkey-focused fast food chains).
 * Run with: npm run import:branded [-- --file /path/to/other.csv]
 *
 * This is a STANDALONE CLI script — NOT part of the runtime application.
 * Defaults to the bundled ./data/branded-foods-turkey.csv (community-sourced Kaggle
 * dataset covering Burger King, Popeyes, McDonald's, Domino's, Subway, Arby's, Sbarro,
 * and Usta Dönerci — see data/branded-foods-turkey.csv for source/license notes).
 *
 * Expected CSV: semicolon-delimited, Turkish-locale decimal commas, columns
 * Company;Product;Energy_kcal;Carbs_g;Protein_g;Fat_g;Price_TL;Category;...;Size;...
 *
 * Values are per menu item/serving (not per 100g) — the source data has no gram
 * weight to normalize against — so these rows are imported with basis=PER_SERVING.
 *
 * Usage:
 *   ts-node src/modules/food-recognition/adapters/search/importBrandedData.ts
 *   ts-node src/modules/food-recognition/adapters/search/importBrandedData.ts --file other.csv
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse';
import { PrismaClient } from '@prisma/client';

const BATCH_SIZE = 500;
const DEFAULT_FILE = path.join(__dirname, 'data', 'branded-foods-turkey.csv');

/** Turkish-locale numbers use ',' as the decimal separator (e.g. "988,21"). */
function parseTurkishFloat(value: string | undefined): number {
  if (!value) return 0;
  const normalized = value.replace(',', '.');
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fileFlag = args.indexOf('--file');
  const filePath = path.resolve(fileFlag === -1 ? DEFAULT_FILE : (args[fileFlag + 1] ?? DEFAULT_FILE));

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    console.log(`Importing branded food data from: ${filePath}`);

    const records: Array<{
      id: string;
      name: string;
      brand: string;
      category: string | null;
      basis: 'PER_SERVING';
      servingLabel: string | null;
      calories: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
    }> = [];

    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(
          parse({
            columns: true,
            delimiter: ';',
            bom: true,
            skip_empty_lines: true,
            trim: true,
          }),
        )
        .on('data', (row: Record<string, string>) => {
          if (!row['Product'] || !row['Company']) return;

          records.push({
            id: crypto.randomUUID(),
            name: row['Product'],
            brand: row['Company'],
            category: row['Category'] || null,
            basis: 'PER_SERVING',
            servingLabel: row['Size'] ? `1 porsiyon (${row['Size']})` : null,
            calories: parseTurkishFloat(row['Energy_kcal']),
            proteinG: parseTurkishFloat(row['Protein_g']),
            carbsG: parseTurkishFloat(row['Carbs_g']),
            fatG: parseTurkishFloat(row['Fat_g']),
          });
        })
        .on('error', reject)
        .on('end', resolve);
    });

    console.log(`Parsed ${records.length} records. Inserting in batches of ${BATCH_SIZE}...`);

    let inserted = 0;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      await prisma.foodCatalogItem.createMany({
        data: batch,
        skipDuplicates: true,
      });
      inserted += batch.length;
      process.stdout.write(`\rInserted ${inserted}/${records.length}`);
    }

    console.log(`\nDone. Imported ${inserted} branded food catalog items.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
