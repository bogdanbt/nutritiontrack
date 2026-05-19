// require('dotenv').config();

// const express = require('express');
// const cors = require('cors');
// const { MongoClient, ObjectId } = require('mongodb');

// const app = express();
// app.use(cors());
// app.use(express.json({ limit: '2mb' }));

// const MONGO_URI = process.env.MONGO_URI;
// const DB_NAME = process.env.DB_NAME || 'nutritrack';
// const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID || 'default';

// let db;

// function now() { return new Date(); }
// function round(n, digits = 2) {
//   const value = Number(n);
//   if (!Number.isFinite(value)) return 0;
//   const p = Math.pow(10, digits);
//   return Math.round(value * p) / p;
// }
// function num(value, fallback = 0) {
//   const n = Number(value);
//   return Number.isFinite(n) ? n : fallback;
// }
// function nullableNum(value) {
//   if (value === undefined || value === null || value === '') return null;
//   const n = Number(value);
//   return Number.isFinite(n) ? n : null;
// }
// function str(value, fallback = '') {
//   if (value === undefined || value === null) return fallback;
//   return String(value).trim();
// }
// function requireName(value, label = 'name') {
//   const s = str(value);
//   if (!s) throw new Error(`${label} is required`);
//   return s;
// }
// function toObjectId(id) {
//   if (!ObjectId.isValid(id)) throw new Error('Invalid ObjectId');
//   return new ObjectId(id);
// }
// function mapDoc(doc) {
//   if (!doc) return null;
//   return { ...doc, id: doc._id.toString() };
// }
// function userQuery(extra = {}) {
//   // Backward compatible: old personal records without userId remain visible.
//   return { ...extra, $or: [{ userId: DEFAULT_USER_ID }, { userId: { $exists: false } }] };
// }

// function normalizeIngredient(input = {}) {
//   const grams = Math.max(0, num(input.grams ?? input.weight, 0));
//   const caloriesPer100g = num(input.caloriesPer100g ?? input.calories ?? input.cals, 0);
//   const proteinPer100g = num(input.proteinPer100g ?? input.protein ?? input.prot, 0);
//   const fatPer100g = num(input.fatPer100g ?? input.fat, 0);
//   const carbsPer100g = num(input.carbsPer100g ?? input.carbs, 0);

//   return {
//     foodId: input.foodId || null,
//     name: requireName(input.name, 'ingredient.name'),
//     grams: round(grams),
//     caloriesPer100g: round(caloriesPer100g),
//     proteinPer100g: round(proteinPer100g),
//     fatPer100g: round(fatPer100g),
//     carbsPer100g: round(carbsPer100g)
//   };
// }

// function calculateTotalsFromIngredients(ingredients) {
//   return ingredients.reduce((acc, ing) => {
//     acc.rawWeight += ing.grams;
//     acc.totalCalories += ing.caloriesPer100g * ing.grams / 100;
//     acc.totalProtein += ing.proteinPer100g * ing.grams / 100;
//     acc.totalFat += ing.fatPer100g * ing.grams / 100;
//     acc.totalCarbs += ing.carbsPer100g * ing.grams / 100;
//     return acc;
//   }, { rawWeight: 0, totalCalories: 0, totalProtein: 0, totalFat: 0, totalCarbs: 0 });
// }

// function normalizeFood(input = {}, existing = {}) {
//   const merged = { ...existing, ...input };
//   const type = merged.type === 'recipe' ? 'recipe' : 'product';
//   const name = requireName(merged.name);

//   if (type === 'recipe') {
//     const ingredients = Array.isArray(merged.ingredients)
//       ? merged.ingredients.map(normalizeIngredient).filter(i => i.grams > 0)
//       : [];

//     const fromIngredients = calculateTotalsFromIngredients(ingredients);
//     const totalCalories = round(nullableNum(merged.totalCalories) ?? fromIngredients.totalCalories);
//     const totalProtein = round(nullableNum(merged.totalProtein) ?? fromIngredients.totalProtein);
//     const totalFat = round(nullableNum(merged.totalFat) ?? fromIngredients.totalFat);
//     const totalCarbs = round(nullableNum(merged.totalCarbs) ?? fromIngredients.totalCarbs);

//     const rawWeight = round(nullableNum(merged.rawWeight) ?? fromIngredients.rawWeight);
//     const cookedWeight = nullableNum(merged.cookedWeight);
//     const portionsTotalRaw = nullableNum(merged.portionsTotal);
//     const portionsTotal = portionsTotalRaw && portionsTotalRaw > 0 ? round(portionsTotalRaw) : null;
//     const portionName = str(merged.portionName, 'порция') || 'порция';

//     const baseWeight = cookedWeight && cookedWeight > 0 ? cookedWeight : rawWeight;
//     const per100 = baseWeight > 0;

//     return {
//       userId: merged.userId || DEFAULT_USER_ID,
//       type,
//       name,
//       per100g: true,
//       calories: per100 ? round(totalCalories / baseWeight * 100) : 0,
//       protein: per100 ? round(totalProtein / baseWeight * 100) : 0,
//       fat: per100 ? round(totalFat / baseWeight * 100) : 0,
//       carbs: per100 ? round(totalCarbs / baseWeight * 100) : 0,
//       totalCalories,
//       totalProtein,
//       totalFat,
//       totalCarbs,
//       rawWeight,
//       cookedWeight,
//       portionsTotal,
//       portionName,
//       ingredients,
//       createdAt: existing.createdAt || now(),
//       updatedAt: now()
//     };
//   }

//   return {
//     userId: merged.userId || DEFAULT_USER_ID,
//     type,
//     name,
//     calories: round(num(merged.calories, 0)),
//     protein: round(num(merged.protein, 0)),
//     fat: round(num(merged.fat, 0)),
//     carbs: round(num(merged.carbs, 0)),
//     per100g: merged.per100g !== false,
//     createdAt: existing.createdAt || now(),
//     updatedAt: now()
//   };
// }

// function nutritionSnapshot(food, factor) {
//   if (food.type === 'recipe') {
//     return {
//       calories: round(num(food.totalCalories, 0) * factor),
//       protein: round(num(food.totalProtein, 0) * factor),
//       fat: round(num(food.totalFat, 0) * factor),
//       carbs: round(num(food.totalCarbs, 0) * factor)
//     };
//   }

//   return {
//     calories: round(num(food.calories, 0) * factor),
//     protein: round(num(food.protein, 0) * factor),
//     fat: round(num(food.fat, 0) * factor),
//     carbs: round(num(food.carbs, 0) * factor)
//   };
// }

// function calculateFoodAmount(food, body = {}) {
//   const type = body.amountType || (body.grams != null ? 'grams' : 'whole');
//   const amount = num(body.amount ?? body.grams ?? body.portions ?? body.fraction ?? 1, 1);

//   if (food.type === 'recipe') {
//     const totalWeight = num(food.cookedWeight, 0) > 0 ? num(food.cookedWeight) : num(food.rawWeight, 0);
//     const portionsTotal = num(food.portionsTotal, 0);

//     if (type === 'grams') {
//       if (totalWeight <= 0) throw new Error('Recipe has no cookedWeight/rawWeight for gram-based logging');
//       const grams = num(body.grams ?? body.amount, 0);
//       return {
//         amountType: 'grams',
//         amount: round(grams),
//         grams: round(grams),
//         portions: null,
//         fraction: round(grams / totalWeight, 4),
//         portionName: food.portionName || null,
//         factor: grams / totalWeight
//       };
//     }

//     if (type === 'portions') {
//       if (portionsTotal <= 0) throw new Error('Recipe has no portionsTotal for portion-based logging');
//       const portions = num(body.portions ?? body.amount, 0);
//       return {
//         amountType: 'portions',
//         amount: round(portions),
//         grams: totalWeight > 0 ? round(totalWeight * portions / portionsTotal) : null,
//         portions: round(portions),
//         fraction: round(portions / portionsTotal, 4),
//         portionName: food.portionName || 'порция',
//         factor: portions / portionsTotal
//       };
//     }

//     if (type === 'fraction') {
//       const fraction = Math.max(0, num(body.fraction ?? body.amount, 0));
//       return {
//         amountType: 'fraction',
//         amount: round(fraction, 4),
//         grams: totalWeight > 0 ? round(totalWeight * fraction) : null,
//         portions: portionsTotal > 0 ? round(portionsTotal * fraction) : null,
//         fraction: round(fraction, 4),
//         portionName: food.portionName || null,
//         factor: fraction
//       };
//     }

//     return {
//       amountType: 'whole',
//       amount: 1,
//       grams: totalWeight > 0 ? round(totalWeight) : null,
//       portions: portionsTotal > 0 ? round(portionsTotal) : null,
//       fraction: 1,
//       portionName: food.portionName || null,
//       factor: 1
//     };
//   }

//   if (food.per100g) {
//     const grams = type === 'whole' ? num(body.grams ?? body.amount, 100) : num(body.grams ?? body.amount, 0);
//     return {
//       amountType: 'grams',
//       amount: round(grams),
//       grams: round(grams),
//       portions: null,
//       fraction: null,
//       portionName: null,
//       factor: grams / 100
//     };
//   }

//   const portions = type === 'fraction' ? num(body.amount ?? body.fraction, 1) : num(body.portions ?? body.amount, 1);
//   return {
//     amountType: type === 'fraction' ? 'fraction' : 'portions',
//     amount: round(portions, 4),
//     grams: null,
//     portions: round(portions, 4),
//     fraction: type === 'fraction' ? round(portions, 4) : null,
//     portionName: food.portionName || 'порция',
//     factor: portions
//   };
// }

// async function buildDiaryEntry(body = {}, existing = {}) {
//   const merged = { ...existing, ...body };
//   const date = str(merged.date, new Date().toISOString().split('T')[0]);
//   const quick = !!merged.quick;

//   if (merged.foodId && !merged.caloriesProvided) {
//     const food = await db.collection('foods').findOne({ _id: toObjectId(merged.foodId), ...userQuery() });
//     if (!food) throw new Error('Food not found');

//     const amount = calculateFoodAmount(food, merged);
//     const macros = nutritionSnapshot(food, amount.factor);
//     return {
//       userId: merged.userId || DEFAULT_USER_ID,
//       foodId: food._id.toString(),
//       foodName: food.name,
//       foodType: food.type || 'product',
//       amountType: amount.amountType,
//       amount: amount.amount,
//       grams: amount.grams,
//       portions: amount.portions,
//       fraction: amount.fraction,
//       portionName: amount.portionName,
//       calories: macros.calories,
//       protein: macros.protein,
//       fat: macros.fat,
//       carbs: macros.carbs,
//       date,
//       quick,
//       sourceFoodSnapshot: mapDoc(food),
//       time: existing.time || now(),
//       updatedAt: now()
//     };
//   }

//   // Backward compatible manual/quick entry: client sends calculated snapshot directly.
//   const grams = nullableNum(merged.grams);
//   const portions = nullableNum(merged.portions);
//   const fraction = nullableNum(merged.fraction);
//   const amountType = merged.amountType || (grams != null ? 'grams' : portions != null ? 'portions' : fraction != null ? 'fraction' : 'manual');

//   return {
//     userId: merged.userId || DEFAULT_USER_ID,
//     foodId: merged.foodId || null,
//     foodName: requireName(merged.foodName, 'foodName'),
//     foodType: merged.foodType || 'manual',
//     amountType,
//     amount: round(num(merged.amount ?? grams ?? portions ?? fraction ?? 1, 1), 4),
//     grams,
//     portions,
//     fraction,
//     portionName: merged.portionName || null,
//     calories: round(num(merged.calories, 0)),
//     protein: round(num(merged.protein, 0)),
//     fat: round(num(merged.fat, 0)),
//     carbs: round(num(merged.carbs, 0)),
//     date,
//     quick,
//     time: existing.time || now(),
//     updatedAt: now()
//   };
// }

// async function connect() {
//   if (!MONGO_URI) throw new Error('MONGO_URI is missing');
//   const client = new MongoClient(MONGO_URI);
//   await client.connect();
//   db = client.db(DB_NAME);
//   console.log(`MongoDB connected: ${DB_NAME}`);

//   await db.collection('foods').createIndex({ userId: 1, name: 1 });
//   await db.collection('diary').createIndex({ userId: 1, date: 1, time: 1 });
//   await db.collection('weight').createIndex({ userId: 1, date: 1 }, { unique: false });

//   const settings = await db.collection('settings').findOne({ _id: 'main' });
//   if (!settings) {
//     await db.collection('settings').insertOne({
//       _id: 'main',
//       userId: DEFAULT_USER_ID,
//       dailyCalories: 1800,
//       dailyProtein: 130,
//       createdAt: now(),
//       updatedAt: now()
//     });
//   }
// }

// function asyncHandler(fn) {
//   return (req, res) => fn(req, res).catch(e => {
//     const status = /required|Invalid|not found|has no/i.test(e.message) ? 400 : 500;
//     res.status(status).json({ error: e.message });
//   });
// }

// app.get('/api/health', (req, res) => {
//   res.json({ ok: true, db: !!db, userId: DEFAULT_USER_ID, time: new Date().toISOString() });
// });

// // Settings
// app.get('/api/settings', asyncHandler(async (req, res) => {
//   const s = await db.collection('settings').findOne({ _id: 'main' });
//   res.json({ dailyCalories: s?.dailyCalories ?? 1800, dailyProtein: s?.dailyProtein ?? 130 });
// }));

// app.put('/api/settings', asyncHandler(async (req, res) => {
//   const patch = {
//     updatedAt: now()
//   };
//   if (req.body.dailyCalories !== undefined) patch.dailyCalories = round(num(req.body.dailyCalories, 1800));
//   if (req.body.dailyProtein !== undefined) patch.dailyProtein = round(num(req.body.dailyProtein, 130));

//   await db.collection('settings').updateOne({ _id: 'main' }, { $set: patch }, { upsert: true });
//   const s = await db.collection('settings').findOne({ _id: 'main' });
//   res.json({ dailyCalories: s.dailyCalories, dailyProtein: s.dailyProtein });
// }));

// // Foods: product library + recipes
// app.get('/api/foods', asyncHandler(async (req, res) => {
//   const query = userQuery();
//   if (req.query.type === 'product' || req.query.type === 'recipe') query.type = req.query.type;
//   const foods = await db.collection('foods').find(query).sort({ createdAt: 1, name: 1 }).toArray();
//   res.json(foods.map(mapDoc));
// }));

// app.get('/api/foods/:id', asyncHandler(async (req, res) => {
//   const food = await db.collection('foods').findOne({ _id: toObjectId(req.params.id), ...userQuery() });
//   if (!food) return res.status(404).json({ error: 'Food not found' });
//   res.json(mapDoc(food));
// }));

// app.post('/api/foods', asyncHandler(async (req, res) => {
//   const food = normalizeFood(req.body);
//   const result = await db.collection('foods').insertOne(food);
//   res.json({ ...food, id: result.insertedId.toString() });
// }));

// app.put('/api/foods/:id', asyncHandler(async (req, res) => {
//   const _id = toObjectId(req.params.id);
//   const existing = await db.collection('foods').findOne({ _id, ...userQuery() });
//   if (!existing) return res.status(404).json({ error: 'Food not found' });

//   const normalized = normalizeFood(req.body, existing);
//   await db.collection('foods').replaceOne({ _id }, normalized);
//   const saved = await db.collection('foods').findOne({ _id });
//   res.json(mapDoc(saved));
// }));

// app.post('/api/foods/import', asyncHandler(async (req, res) => {
//   if (!Array.isArray(req.body)) throw new Error('Body must be an array');
//   const foods = req.body.map(item => normalizeFood(item));
//   if (!foods.length) return res.json({ inserted: 0 });
//   const result = await db.collection('foods').insertMany(foods);
//   res.json({ inserted: result.insertedCount });
// }));

// app.delete('/api/foods/:id', asyncHandler(async (req, res) => {
//   await db.collection('foods').deleteOne({ _id: toObjectId(req.params.id), ...userQuery() });
//   res.json({ ok: true });
// }));

// // Diary
// app.get('/api/diary', asyncHandler(async (req, res) => {
//   const { date } = req.query;
//   const query = userQuery(date ? { date } : {});
//   const entries = await db.collection('diary').find(query).sort({ time: 1 }).toArray();
//   res.json(entries.map(mapDoc));
// }));

// app.get('/api/diary/dates', asyncHandler(async (req, res) => {
//   const dates = await db.collection('diary').distinct('date', userQuery());
//   res.json(dates.filter(Boolean).sort().reverse());
// }));

// app.post('/api/diary', asyncHandler(async (req, res) => {
//   // If client sends foodId + amountType, server calculates. If client sends calories, it stores the snapshot.
//   const body = { ...req.body };
//   if (req.body.calories !== undefined && !req.body.amountType) body.caloriesProvided = true;
//   const entry = await buildDiaryEntry(body);
//   const result = await db.collection('diary').insertOne(entry);
//   res.json({ ...entry, id: result.insertedId.toString() });
// }));

// app.put('/api/diary/:id', asyncHandler(async (req, res) => {
//   const _id = toObjectId(req.params.id);
//   const existing = await db.collection('diary').findOne({ _id, ...userQuery() });
//   if (!existing) return res.status(404).json({ error: 'Diary entry not found' });

//   const shouldRecalculate = req.body.foodId || existing.foodId || req.body.amountType || req.body.amount !== undefined || req.body.grams !== undefined || req.body.portions !== undefined || req.body.fraction !== undefined;
//   const body = { ...existing, ...req.body };
//   if (!shouldRecalculate || (req.body.calories !== undefined && !req.body.foodId && !req.body.amountType)) body.caloriesProvided = true;
//   const normalized = await buildDiaryEntry(body, existing);
//   await db.collection('diary').replaceOne({ _id }, normalized);
//   const saved = await db.collection('diary').findOne({ _id });
//   res.json(mapDoc(saved));
// }));

// app.delete('/api/diary/:id', asyncHandler(async (req, res) => {
//   await db.collection('diary').deleteOne({ _id: toObjectId(req.params.id), ...userQuery() });
//   res.json({ ok: true });
// }));

// // Weight
// app.get('/api/weight', asyncHandler(async (req, res) => {
//   const weights = await db.collection('weight').find(userQuery()).sort({ date: 1 }).toArray();
//   res.json(weights.map(mapDoc));
// }));

// app.post('/api/weight', asyncHandler(async (req, res) => {
//   const date = requireName(req.body.date, 'date');
//   await db.collection('weight').updateOne(
//     { userId: DEFAULT_USER_ID, date },
//     { $set: { userId: DEFAULT_USER_ID, date, kg: round(num(req.body.kg, 0)), updatedAt: now() }, $setOnInsert: { createdAt: now() } },
//     { upsert: true }
//   );
//   res.json({ ok: true });
// }));

// app.delete('/api/weight/:date', asyncHandler(async (req, res) => {
//   await db.collection('weight').deleteOne({ userId: DEFAULT_USER_ID, date: req.params.date });
//   res.json({ ok: true });
// }));

// // Stats
// app.get('/api/stats/week', asyncHandler(async (req, res) => {
//   const today = new Date();
//   const days = [];
//   for (let i = 6; i >= 0; i--) {
//     const d = new Date(today);
//     d.setDate(d.getDate() - i);
//     days.push(d.toISOString().split('T')[0]);
//   }

//   const entries = await db.collection('diary').find(userQuery({ date: { $in: days } })).toArray();
//   const result = days.map(date => {
//     const de = entries.filter(e => e.date === date);
//     return {
//       date,
//       calories: round(de.reduce((s, e) => s + num(e.calories, 0), 0)),
//       protein: round(de.reduce((s, e) => s + num(e.protein, 0), 0)),
//       fat: round(de.reduce((s, e) => s + num(e.fat, 0), 0)),
//       carbs: round(de.reduce((s, e) => s + num(e.carbs, 0), 0))
//     };
//   });
//   res.json(result);
// }));

// const PORT = process.env.PORT || 3001;
// connect()
//   .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
//   .catch(err => { console.error('MongoDB connection failed:', err); process.exit(1); });


require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME || 'nutritrack';
const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID || 'default';

let db;

function now() { return new Date(); }
function round(n, digits = 2) {
  const value = Number(n);
  if (!Number.isFinite(value)) return 0;
  const p = Math.pow(10, digits);
  return Math.round(value * p) / p;
}
function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function nullableNum(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function str(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}
function requireName(value, label = 'name') {
  const s = str(value);
  if (!s) throw new Error(`${label} is required`);
  return s;
}
function toObjectId(id) {
  if (!ObjectId.isValid(id)) throw new Error('Invalid ObjectId');
  return new ObjectId(id);
}
function mapDoc(doc) {
  if (!doc) return null;
  return { ...doc, id: doc._id.toString() };
}
function userQuery(extra = {}) {
  // Backward compatible: old personal records without userId remain visible.
  return { ...extra, $or: [{ userId: DEFAULT_USER_ID }, { userId: { $exists: false } }] };
}

function normalizeIngredient(input = {}) {
  const grams = Math.max(0, num(input.grams ?? input.weight, 0));
  const caloriesPer100g = num(input.caloriesPer100g ?? input.calories ?? input.cals, 0);
  const proteinPer100g = num(input.proteinPer100g ?? input.protein ?? input.prot, 0);
  const fatPer100g = num(input.fatPer100g ?? input.fat, 0);
  const carbsPer100g = num(input.carbsPer100g ?? input.carbs, 0);

  return {
    foodId: input.foodId || null,
    name: requireName(input.name, 'ingredient.name'),
    grams: round(grams),
    caloriesPer100g: round(caloriesPer100g),
    proteinPer100g: round(proteinPer100g),
    fatPer100g: round(fatPer100g),
    carbsPer100g: round(carbsPer100g)
  };
}

function calculateTotalsFromIngredients(ingredients) {
  return ingredients.reduce((acc, ing) => {
    acc.rawWeight += ing.grams;
    acc.totalCalories += ing.caloriesPer100g * ing.grams / 100;
    acc.totalProtein += ing.proteinPer100g * ing.grams / 100;
    acc.totalFat += ing.fatPer100g * ing.grams / 100;
    acc.totalCarbs += ing.carbsPer100g * ing.grams / 100;
    return acc;
  }, { rawWeight: 0, totalCalories: 0, totalProtein: 0, totalFat: 0, totalCarbs: 0 });
}

function normalizeFood(input = {}, existing = {}) {
  const merged = { ...existing, ...input };
  const type = merged.type === 'recipe' ? 'recipe' : 'product';
  const name = requireName(merged.name);

  if (type === 'recipe') {
    const ingredients = Array.isArray(merged.ingredients)
      ? merged.ingredients.map(normalizeIngredient).filter(i => i.grams > 0)
      : [];

    const fromIngredients = calculateTotalsFromIngredients(ingredients);
    const totalCalories = round(nullableNum(merged.totalCalories) ?? fromIngredients.totalCalories);
    const totalProtein = round(nullableNum(merged.totalProtein) ?? fromIngredients.totalProtein);
    const totalFat = round(nullableNum(merged.totalFat) ?? fromIngredients.totalFat);
    const totalCarbs = round(nullableNum(merged.totalCarbs) ?? fromIngredients.totalCarbs);

    const rawWeight = round(nullableNum(merged.rawWeight) ?? fromIngredients.rawWeight);
    const cookedWeight = nullableNum(merged.cookedWeight);
    const portionsTotalRaw = nullableNum(merged.portionsTotal);
    const portionsTotal = portionsTotalRaw && portionsTotalRaw > 0 ? round(portionsTotalRaw) : null;
    const portionName = str(merged.portionName, 'порция') || 'порция';

    const baseWeight = cookedWeight && cookedWeight > 0 ? cookedWeight : rawWeight;
    const per100 = baseWeight > 0;

    return {
      userId: merged.userId || DEFAULT_USER_ID,
      type,
      name,
      per100g: true,
      calories: per100 ? round(totalCalories / baseWeight * 100) : 0,
      protein: per100 ? round(totalProtein / baseWeight * 100) : 0,
      fat: per100 ? round(totalFat / baseWeight * 100) : 0,
      carbs: per100 ? round(totalCarbs / baseWeight * 100) : 0,
      totalCalories,
      totalProtein,
      totalFat,
      totalCarbs,
      rawWeight,
      cookedWeight,
      portionsTotal,
      portionName,
      ingredients,
      createdAt: existing.createdAt || now(),
      updatedAt: now()
    };
  }

  return {
    userId: merged.userId || DEFAULT_USER_ID,
    type,
    name,
    calories: round(num(merged.calories, 0)),
    protein: round(num(merged.protein, 0)),
    fat: round(num(merged.fat, 0)),
    carbs: round(num(merged.carbs, 0)),
    per100g: merged.per100g !== false,
    createdAt: existing.createdAt || now(),
    updatedAt: now()
  };
}

function nutritionSnapshot(food, factor) {
  if (food.type === 'recipe') {
    return {
      calories: round(num(food.totalCalories, 0) * factor),
      protein: round(num(food.totalProtein, 0) * factor),
      fat: round(num(food.totalFat, 0) * factor),
      carbs: round(num(food.totalCarbs, 0) * factor)
    };
  }

  return {
    calories: round(num(food.calories, 0) * factor),
    protein: round(num(food.protein, 0) * factor),
    fat: round(num(food.fat, 0) * factor),
    carbs: round(num(food.carbs, 0) * factor)
  };
}

function calculateFoodAmount(food, body = {}) {
  const type = body.amountType || (body.grams != null ? 'grams' : 'whole');
  const amount = num(body.amount ?? body.grams ?? body.portions ?? body.fraction ?? 1, 1);

  if (food.type === 'recipe') {
    const totalWeight = num(food.cookedWeight, 0) > 0 ? num(food.cookedWeight) : num(food.rawWeight, 0);
    const portionsTotal = num(food.portionsTotal, 0);

    if (type === 'grams') {
      if (totalWeight <= 0) throw new Error('Recipe has no cookedWeight/rawWeight for gram-based logging');
      const grams = num(body.grams ?? body.amount, 0);
      return {
        amountType: 'grams',
        amount: round(grams),
        grams: round(grams),
        portions: null,
        fraction: round(grams / totalWeight, 4),
        portionName: food.portionName || null,
        factor: grams / totalWeight
      };
    }

    if (type === 'portions') {
      if (portionsTotal <= 0) throw new Error('Recipe has no portionsTotal for portion-based logging');
      const portions = num(body.portions ?? body.amount, 0);
      return {
        amountType: 'portions',
        amount: round(portions),
        grams: totalWeight > 0 ? round(totalWeight * portions / portionsTotal) : null,
        portions: round(portions),
        fraction: round(portions / portionsTotal, 4),
        portionName: food.portionName || 'порция',
        factor: portions / portionsTotal
      };
    }

    if (type === 'fraction') {
      const fraction = Math.max(0, num(body.fraction ?? body.amount, 0));
      return {
        amountType: 'fraction',
        amount: round(fraction, 4),
        grams: totalWeight > 0 ? round(totalWeight * fraction) : null,
        portions: portionsTotal > 0 ? round(portionsTotal * fraction) : null,
        fraction: round(fraction, 4),
        portionName: food.portionName || null,
        factor: fraction
      };
    }

    return {
      amountType: 'whole',
      amount: 1,
      grams: totalWeight > 0 ? round(totalWeight) : null,
      portions: portionsTotal > 0 ? round(portionsTotal) : null,
      fraction: 1,
      portionName: food.portionName || null,
      factor: 1
    };
  }

  if (food.per100g) {
    const grams = type === 'whole' ? num(body.grams ?? body.amount, 100) : num(body.grams ?? body.amount, 0);
    return {
      amountType: 'grams',
      amount: round(grams),
      grams: round(grams),
      portions: null,
      fraction: null,
      portionName: null,
      factor: grams / 100
    };
  }

  const portions = type === 'fraction' ? num(body.amount ?? body.fraction, 1) : num(body.portions ?? body.amount, 1);
  return {
    amountType: type === 'fraction' ? 'fraction' : 'portions',
    amount: round(portions, 4),
    grams: null,
    portions: round(portions, 4),
    fraction: type === 'fraction' ? round(portions, 4) : null,
    portionName: food.portionName || 'порция',
    factor: portions
  };
}

async function buildDiaryEntry(body = {}, existing = {}) {
  const merged = { ...existing, ...body };
  const date = str(merged.date, new Date().toISOString().split('T')[0]);
  const quick = !!merged.quick;

  if (merged.foodId && !merged.caloriesProvided) {
    const food = await db.collection('foods').findOne({ _id: toObjectId(merged.foodId), ...userQuery() });
    if (!food) throw new Error('Food not found');

    const amount = calculateFoodAmount(food, merged);
    const macros = nutritionSnapshot(food, amount.factor);
    return {
      userId: merged.userId || DEFAULT_USER_ID,
      foodId: food._id.toString(),
      foodName: food.name,
      foodType: food.type || 'product',
      amountType: amount.amountType,
      amount: amount.amount,
      grams: amount.grams,
      portions: amount.portions,
      fraction: amount.fraction,
      portionName: amount.portionName,
      calories: macros.calories,
      protein: macros.protein,
      fat: macros.fat,
      carbs: macros.carbs,
      date,
      quick,
      sourceFoodSnapshot: mapDoc(food),
      time: existing.time || now(),
      updatedAt: now()
    };
  }

  // Backward compatible manual/quick entry: client sends calculated snapshot directly.
  const grams = nullableNum(merged.grams);
  const portions = nullableNum(merged.portions);
  const fraction = nullableNum(merged.fraction);
  const amountType = merged.amountType || (grams != null ? 'grams' : portions != null ? 'portions' : fraction != null ? 'fraction' : 'manual');

  return {
    userId: merged.userId || DEFAULT_USER_ID,
    foodId: merged.foodId || null,
    foodName: requireName(merged.foodName, 'foodName'),
    foodType: merged.foodType || 'manual',
    amountType,
    amount: round(num(merged.amount ?? grams ?? portions ?? fraction ?? 1, 1), 4),
    grams,
    portions,
    fraction,
    portionName: merged.portionName || null,
    calories: round(num(merged.calories, 0)),
    protein: round(num(merged.protein, 0)),
    fat: round(num(merged.fat, 0)),
    carbs: round(num(merged.carbs, 0)),
    date,
    quick,
    time: existing.time || now(),
    updatedAt: now()
  };
}

async function connect() {
  if (!MONGO_URI) throw new Error('MONGO_URI is missing');
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db(DB_NAME);
  console.log(`MongoDB connected: ${DB_NAME}`);

  await db.collection('foods').createIndex({ userId: 1, name: 1 });
  await db.collection('diary').createIndex({ userId: 1, date: 1, time: 1 });
  await db.collection('weight').createIndex({ userId: 1, date: 1 }, { unique: false });
  await db.collection('presets').createIndex({ userId: 1, createdAt: 1 });

  const settings = await db.collection('settings').findOne({ _id: 'main' });
  if (!settings) {
    await db.collection('settings').insertOne({
      _id: 'main',
      userId: DEFAULT_USER_ID,
      dailyCalories: 1800,
      dailyProtein: 130,
      createdAt: now(),
      updatedAt: now()
    });
  }
}

function asyncHandler(fn) {
  return (req, res) => fn(req, res).catch(e => {
    const status = /required|Invalid|not found|has no/i.test(e.message) ? 400 : 500;
    res.status(status).json({ error: e.message });
  });
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, db: !!db, userId: DEFAULT_USER_ID, time: new Date().toISOString() });
});

// Settings
app.get('/api/settings', asyncHandler(async (req, res) => {
  const s = await db.collection('settings').findOne({ _id: 'main' });
  res.json({ dailyCalories: s?.dailyCalories ?? 1800, dailyProtein: s?.dailyProtein ?? 130 });
}));

app.put('/api/settings', asyncHandler(async (req, res) => {
  const patch = {
    updatedAt: now()
  };
  if (req.body.dailyCalories !== undefined) patch.dailyCalories = round(num(req.body.dailyCalories, 1800));
  if (req.body.dailyProtein !== undefined) patch.dailyProtein = round(num(req.body.dailyProtein, 130));

  await db.collection('settings').updateOne({ _id: 'main' }, { $set: patch }, { upsert: true });
  const s = await db.collection('settings').findOne({ _id: 'main' });
  res.json({ dailyCalories: s.dailyCalories, dailyProtein: s.dailyProtein });
}));

// Foods: product library + recipes
app.get('/api/foods', asyncHandler(async (req, res) => {
  const query = userQuery();
  if (req.query.type === 'product' || req.query.type === 'recipe') query.type = req.query.type;
  const foods = await db.collection('foods').find(query).sort({ createdAt: 1, name: 1 }).toArray();
  res.json(foods.map(mapDoc));
}));

app.get('/api/foods/:id', asyncHandler(async (req, res) => {
  const food = await db.collection('foods').findOne({ _id: toObjectId(req.params.id), ...userQuery() });
  if (!food) return res.status(404).json({ error: 'Food not found' });
  res.json(mapDoc(food));
}));

app.post('/api/foods', asyncHandler(async (req, res) => {
  const food = normalizeFood(req.body);
  const result = await db.collection('foods').insertOne(food);
  res.json({ ...food, id: result.insertedId.toString() });
}));

app.put('/api/foods/:id', asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.id);
  const existing = await db.collection('foods').findOne({ _id, ...userQuery() });
  if (!existing) return res.status(404).json({ error: 'Food not found' });

  const normalized = normalizeFood(req.body, existing);
  await db.collection('foods').replaceOne({ _id }, normalized);
  const saved = await db.collection('foods').findOne({ _id });
  res.json(mapDoc(saved));
}));

app.post('/api/foods/import', asyncHandler(async (req, res) => {
  if (!Array.isArray(req.body)) throw new Error('Body must be an array');
  const foods = req.body.map(item => normalizeFood(item));
  if (!foods.length) return res.json({ inserted: 0 });
  const result = await db.collection('foods').insertMany(foods);
  res.json({ inserted: result.insertedCount });
}));

app.delete('/api/foods/:id', asyncHandler(async (req, res) => {
  await db.collection('foods').deleteOne({ _id: toObjectId(req.params.id), ...userQuery() });
  res.json({ ok: true });
}));

// Patch food meta (isFavorite, defaultAmount, defaultAmountType, useCount, lastUsed)
app.patch('/api/foods/:id', asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.id);
  const existing = await db.collection('foods').findOne({ _id, ...userQuery() });
  if (!existing) return res.status(404).json({ error: 'Food not found' });

  const patch = { updatedAt: now() };
  if (req.body.isFavorite !== undefined) patch.isFavorite = !!req.body.isFavorite;
  if (req.body.defaultAmount !== undefined) patch.defaultAmount = nullableNum(req.body.defaultAmount);
  if (req.body.defaultAmountType !== undefined) patch.defaultAmountType = str(req.body.defaultAmountType);
  if (req.body.useCount !== undefined) patch.useCount = Math.max(0, num(req.body.useCount, 0));
  if (req.body.lastUsed !== undefined) patch.lastUsed = req.body.lastUsed;

  await db.collection('foods').updateOne({ _id }, { $set: patch });
  const saved = await db.collection('foods').findOne({ _id });
  res.json(mapDoc(saved));
}));

// Presets (meal combos)
app.get('/api/presets', asyncHandler(async (req, res) => {
  const presets = await db.collection('presets').find(userQuery()).sort({ useCount: -1, createdAt: 1 }).toArray();
  res.json(presets.map(mapDoc));
}));

app.post('/api/presets', asyncHandler(async (req, res) => {
  const name = requireName(req.body.name);
  const emoji = str(req.body.emoji, '🍽️');
  const items = Array.isArray(req.body.items) ? req.body.items.map(item => ({
    foodId: str(item.foodId),
    foodName: str(item.foodName),
    amount: round(num(item.amount, 1)),
    amountType: str(item.amountType, 'grams')
  })).filter(i => i.foodId) : [];

  if (!items.length) throw new Error('Preset must have at least one item');

  const preset = {
    userId: DEFAULT_USER_ID,
    name,
    emoji,
    items,
    useCount: 0,
    createdAt: now(),
    updatedAt: now()
  };
  const result = await db.collection('presets').insertOne(preset);
  res.json({ ...preset, id: result.insertedId.toString() });
}));

app.patch('/api/presets/:id', asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.id);
  const existing = await db.collection('presets').findOne({ _id, ...userQuery() });
  if (!existing) return res.status(404).json({ error: 'Preset not found' });

  const patch = { updatedAt: now() };
  if (req.body.name !== undefined) patch.name = requireName(req.body.name);
  if (req.body.emoji !== undefined) patch.emoji = str(req.body.emoji);
  if (req.body.useCount !== undefined) patch.useCount = Math.max(0, num(req.body.useCount, 0));

  await db.collection('presets').updateOne({ _id }, { $set: patch });
  const saved = await db.collection('presets').findOne({ _id });
  res.json(mapDoc(saved));
}));

app.delete('/api/presets/:id', asyncHandler(async (req, res) => {
  await db.collection('presets').deleteOne({ _id: toObjectId(req.params.id), ...userQuery() });
  res.json({ ok: true });
}));

// Diary
app.get('/api/diary', asyncHandler(async (req, res) => {
  const { date } = req.query;
  const query = userQuery(date ? { date } : {});
  const entries = await db.collection('diary').find(query).sort({ time: 1 }).toArray();
  res.json(entries.map(mapDoc));
}));

app.get('/api/diary/dates', asyncHandler(async (req, res) => {
  const dates = await db.collection('diary').distinct('date', userQuery());
  res.json(dates.filter(Boolean).sort().reverse());
}));

app.post('/api/diary', asyncHandler(async (req, res) => {
  // If client sends foodId + amountType, server calculates. If client sends calories, it stores the snapshot.
  const body = { ...req.body };
  if (req.body.calories !== undefined && !req.body.amountType) body.caloriesProvided = true;
  const entry = await buildDiaryEntry(body);
  const result = await db.collection('diary').insertOne(entry);
  res.json({ ...entry, id: result.insertedId.toString() });
}));

app.put('/api/diary/:id', asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.id);
  const existing = await db.collection('diary').findOne({ _id, ...userQuery() });
  if (!existing) return res.status(404).json({ error: 'Diary entry not found' });

  const shouldRecalculate = req.body.foodId || existing.foodId || req.body.amountType || req.body.amount !== undefined || req.body.grams !== undefined || req.body.portions !== undefined || req.body.fraction !== undefined;
  const body = { ...existing, ...req.body };
  if (!shouldRecalculate || (req.body.calories !== undefined && !req.body.foodId && !req.body.amountType)) body.caloriesProvided = true;
  const normalized = await buildDiaryEntry(body, existing);
  await db.collection('diary').replaceOne({ _id }, normalized);
  const saved = await db.collection('diary').findOne({ _id });
  res.json(mapDoc(saved));
}));

app.delete('/api/diary/:id', asyncHandler(async (req, res) => {
  await db.collection('diary').deleteOne({ _id: toObjectId(req.params.id), ...userQuery() });
  res.json({ ok: true });
}));

// Weight
app.get('/api/weight', asyncHandler(async (req, res) => {
  const weights = await db.collection('weight').find(userQuery()).sort({ date: 1 }).toArray();
  res.json(weights.map(mapDoc));
}));

app.post('/api/weight', asyncHandler(async (req, res) => {
  const date = requireName(req.body.date, 'date');
  await db.collection('weight').updateOne(
    { userId: DEFAULT_USER_ID, date },
    { $set: { userId: DEFAULT_USER_ID, date, kg: round(num(req.body.kg, 0)), updatedAt: now() }, $setOnInsert: { createdAt: now() } },
    { upsert: true }
  );
  res.json({ ok: true });
}));

app.delete('/api/weight/:date', asyncHandler(async (req, res) => {
  await db.collection('weight').deleteOne({ userId: DEFAULT_USER_ID, date: req.params.date });
  res.json({ ok: true });
}));

// Stats
app.get('/api/stats/week', asyncHandler(async (req, res) => {
  const today = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }

  const entries = await db.collection('diary').find(userQuery({ date: { $in: days } })).toArray();
  const result = days.map(date => {
    const de = entries.filter(e => e.date === date);
    return {
      date,
      calories: round(de.reduce((s, e) => s + num(e.calories, 0), 0)),
      protein: round(de.reduce((s, e) => s + num(e.protein, 0), 0)),
      fat: round(de.reduce((s, e) => s + num(e.fat, 0), 0)),
      carbs: round(de.reduce((s, e) => s + num(e.carbs, 0), 0))
    };
  });
  res.json(result);
}));

const PORT = process.env.PORT || 3001;
connect()
  .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
  .catch(err => { console.error('MongoDB connection failed:', err); process.exit(1); });