#!/usr/bin/env ts-node
/**
 * USDA FoodData Central import script.
 * Run with: npm run import:usda -- --file /path/to/food.csv
 *
 * This is a STANDALONE CLI script — NOT part of the runtime application.
 * Expected CSV columns: id, description, calories_per_100g, protein_per_100g,
 *                       carbohydrates_per_100g, fat_per_100g
 *
 * Usage:
 *   ts-node src/modules/food-recognition/adapters/search/importUsdaData.ts --file FoodData_Central.csv
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse';
import { PrismaClient } from '@prisma/client';

const BATCH_SIZE = 500;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fileFlag = args.indexOf('--file');
  const fileArg = fileFlag === -1 ? undefined : args[fileFlag + 1];
  if (!fileArg) {
    console.error('Usage: ts-node importUsdaData.ts --file <path-to-csv>');
    process.exit(1);
  }

  const filePath = path.resolve(fileArg);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    console.log(`Importing USDA data from: ${filePath}`);

    const records: Array<{
      id: string;
      name: string;
      caloriesPer100g: number;
      proteinPer100g: number;
      carbsPer100g: number;
      fatPer100g: number;
    }> = [];

    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(
          parse({
            columns: true,
            skip_empty_lines: true,
            trim: true,
          }),
        )
        .on('data', (row: Record<string, string>) => {
          const calories = parseFloat(row['calories_per_100g'] ?? '0');
          const protein = parseFloat(row['protein_per_100g'] ?? '0');
          const carbs = parseFloat(row['carbohydrates_per_100g'] ?? '0');
          const fat = parseFloat(row['fat_per_100g'] ?? '0');

          if (!row['description']) return;

          records.push({
            id: row['id'] ?? crypto.randomUUID(),
            name: row['description'],
            caloriesPer100g: isNaN(calories) ? 0 : calories,
            proteinPer100g: isNaN(protein) ? 0 : protein,
            carbsPer100g: isNaN(carbs) ? 0 : carbs,
            fatPer100g: isNaN(fat) ? 0 : fat,
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

    console.log(`\nDone. Imported ${inserted} food catalog items.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
