#!/usr/bin/env ts-node
/**
 * Generic Turkish dish catalog import script (lahmacun, döner, mantı, etc. — not
 * tied to any restaurant chain).
 * Run with: npm run import:turkish-dishes [-- --file /path/to/other.csv]
 *
 * This is a STANDALONE CLI script — NOT part of the runtime application.
 * Defaults to the bundled ./data/turkish-generic-dishes.csv, hand-compiled from
 * several Turkish nutrition reference sites and cross-checked for calorie/macro
 * consistency (kcal ≈ 4*protein + 4*carbs + 9*fat) — see data/README.md for sources
 * and accuracy caveats.
 *
 * Values are per 100g (basis=PER_100G), same convention as the USDA import, since
 * these are home-style dishes eaten in variable portions rather than fixed menu items.
 *
 * Expected CSV: comma-delimited, columns name,category,calories,protein_g,carbs_g,fat_g
 *
 * Usage:
 *   ts-node src/modules/food-recognition/adapters/search/importTurkishDishesData.ts
 *   ts-node src/modules/food-recognition/adapters/search/importTurkishDishesData.ts --file other.csv
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse';
import { PrismaClient } from '@prisma/client';

const BATCH_SIZE = 500;
const DEFAULT_FILE = path.join(__dirname, 'data', 'turkish-generic-dishes.csv');

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
    console.log(`Importing Turkish dish data from: ${filePath}`);

    const records: Array<{
      id: string;
      name: string;
      category: string | null;
      basis: 'PER_100G';
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
            bom: true,
            skip_empty_lines: true,
            trim: true,
          }),
        )
        .on('data', (row: Record<string, string>) => {
          if (!row['name']) return;

          const calories = parseFloat(row['calories'] ?? '0');
          const protein = parseFloat(row['protein_g'] ?? '0');
          const carbs = parseFloat(row['carbs_g'] ?? '0');
          const fat = parseFloat(row['fat_g'] ?? '0');

          records.push({
            id: crypto.randomUUID(),
            name: row['name'],
            category: row['category'] || null,
            basis: 'PER_100G',
            calories: isNaN(calories) ? 0 : calories,
            proteinG: isNaN(protein) ? 0 : protein,
            carbsG: isNaN(carbs) ? 0 : carbs,
            fatG: isNaN(fat) ? 0 : fat,
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

    console.log(`\nDone. Imported ${inserted} Turkish dish catalog items.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
