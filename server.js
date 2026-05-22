require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();

app.use(cors());
app.use(express.json({ limit: '4mb' }));

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME || 'nutritrack';
const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID || 'default';
const PORT = process.env.PORT || 3001;

let db;

function now() {
  return new Date();
}

function isoNow() {
  return new Date().toISOString();
}

function round(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const p = Math.pow(10, digits);
  return Math.round(number * p) / p;
}

function num(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nullableNum(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function str(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function requireString(value, label = 'value') {
  const s = str(value);
  if (!s) throw new Error(`${label} is required`);
  return s;
}

function normalizeName(value) {
  return str(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/g, '')
    .trim();
}

function toObjectId(id) {
  if (!ObjectId.isValid(id)) throw new Error('Invalid ObjectId');
  return new ObjectId(id);
}

function mapDoc(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { ...rest, id: _id.toString() };
}

function userQuery(extra = {}) {
  return {
    ...extra,
    $or: [
      { userId: DEFAULT_USER_ID },
      { userId: { $exists: false } }
    ]
  };
}

function asyncHandler(fn) {
  return (req, res) => {
    Promise.resolve(fn(req, res)).catch(error => {
      const message = error && error.message ? error.message : String(error);
      const status = /required|invalid|not found|has no|must|empty/i.test(message) ? 400 : 500;
      res.status(status).json({ error: message });
    });
  };
}

function detectMealType(dateValue = new Date()) {
  const date = new Date(dateValue);
  const hour = date.getHours();

  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 16) return 'lunch';
  if (hour >= 16 && hour < 22) return 'dinner';
  return 'snack';
}

function dateStringFrom(value) {
  if (value) return str(value);
  return new Date().toISOString().split('T')[0];
}

function macroTotals(items) {
  return items.reduce((acc, item) => {
    acc.calories += num(item.calories);
    acc.protein += num(item.protein);
    acc.fat += num(item.fat);
    acc.carbs += num(item.carbs);
    if (item.grams !== undefined && item.grams !== null) {
      acc.weight += num(item.grams);
    }
    return acc;
  }, { calories: 0, protein: 0, fat: 0, carbs: 0, weight: 0 });
}

function cleanTotals(totals) {
  return {
    calories: round(totals.calories),
    protein: round(totals.protein),
    fat: round(totals.fat),
    carbs: round(totals.carbs),
    weight: round(totals.weight)
  };
}

function normalizeIngredient(input = {}) {
  const name = requireString(input.name, 'ingredient.name');
  const normalizedName = normalizeName(input.normalizedName || name);

  return {
    foodId: input.foodId || null,
    name,
    normalizedName,
    grams: round(Math.max(0, num(input.grams ?? input.weight, 0))),
    caloriesPer100g: round(num(input.caloriesPer100g ?? input.calories ?? input.cals, 0)),
    proteinPer100g: round(num(input.proteinPer100g ?? input.protein ?? input.prot, 0)),
    fatPer100g: round(num(input.fatPer100g ?? input.fat, 0)),
    carbsPer100g: round(num(input.carbsPer100g ?? input.carbs, 0)),
    saveStatus: input.saveStatus || null
  };
}

function calculateTotalsFromIngredients(ingredients) {
  return ingredients.reduce((acc, ingredient) => {
    const grams = num(ingredient.grams);
    const factor = grams / 100;

    acc.rawWeight += grams;
    acc.totalCalories += num(ingredient.caloriesPer100g) * factor;
    acc.totalProtein += num(ingredient.proteinPer100g) * factor;
    acc.totalFat += num(ingredient.fatPer100g) * factor;
    acc.totalCarbs += num(ingredient.carbsPer100g) * factor;

    return acc;
  }, {
    rawWeight: 0,
    totalCalories: 0,
    totalProtein: 0,
    totalFat: 0,
    totalCarbs: 0
  });
}

function normalizeFood(input = {}, existing = {}) {
  const merged = { ...existing, ...input };
  const type = merged.type === 'recipe' ? 'recipe' : 'product';
  const name = requireString(merged.name, 'name');
  const normalizedName = normalizeName(merged.normalizedName || name);

  if (type === 'recipe') {
    const ingredients = Array.isArray(merged.ingredients)
      ? merged.ingredients.map(normalizeIngredient).filter(item => item.grams > 0)
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
    const hasWeight = baseWeight > 0;

    return {
      userId: merged.userId || DEFAULT_USER_ID,
      type,
      name,
      normalizedName,
      per100g: true,
      calories: hasWeight ? round(totalCalories / baseWeight * 100) : 0,
      protein: hasWeight ? round(totalProtein / baseWeight * 100) : 0,
      fat: hasWeight ? round(totalFat / baseWeight * 100) : 0,
      carbs: hasWeight ? round(totalCarbs / baseWeight * 100) : 0,
      totalCalories,
      totalProtein,
      totalFat,
      totalCarbs,
      rawWeight,
      cookedWeight,
      portionsTotal,
      portionName,
      ingredients,
      source: merged.source || 'manual',
      defaultAmount: nullableNum(merged.defaultAmount),
      defaultAmountType: merged.defaultAmountType || null,
      isFavorite: !!merged.isFavorite,
      useCount: Math.max(0, num(merged.useCount, 0)),
      lastUsed: merged.lastUsed || null,
      createdAt: existing.createdAt || now(),
      updatedAt: now()
    };
  }

  return {
    userId: merged.userId || DEFAULT_USER_ID,
    type,
    name,
    normalizedName,
    calories: round(num(merged.calories, 0)),
    protein: round(num(merged.protein, 0)),
    fat: round(num(merged.fat, 0)),
    carbs: round(num(merged.carbs, 0)),
    per100g: merged.per100g !== false,
    portionName: merged.portionName || null,
    source: merged.source || 'manual',
    defaultAmount: nullableNum(merged.defaultAmount),
    defaultAmountType: merged.defaultAmountType || null,
    isFavorite: !!merged.isFavorite,
    useCount: Math.max(0, num(merged.useCount, 0)),
    lastUsed: merged.lastUsed || null,
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
      const portions = num(body.portions ?? body.amount, amount);
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

  const portions = type === 'fraction'
    ? num(body.amount ?? body.fraction, 1)
    : num(body.portions ?? body.amount, 1);

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

async function upsertProduct(input = {}) {
  const name = requireString(input.name, 'name');
  const normalizedName = normalizeName(input.normalizedName || name);

  const existing = await db.collection('foods').findOne({
    userId: DEFAULT_USER_ID,
    type: 'product',
    normalizedName
  });

  const normalized = normalizeFood({
    ...existing,
    ...input,
    type: 'product',
    name,
    normalizedName,
    source: input.source || existing?.source || 'manual'
  }, existing || {});

  if (existing) {
    await db.collection('foods').updateOne(
      { _id: existing._id },
      { $set: { ...normalized, createdAt: existing.createdAt || normalized.createdAt } }
    );
    return mapDoc(await db.collection('foods').findOne({ _id: existing._id }));
  }

  const result = await db.collection('foods').insertOne(normalized);
  return mapDoc(await db.collection('foods').findOne({ _id: result.insertedId }));
}

async function normalizeMealItem(input = {}) {
  const itemId = str(input.id) || new ObjectId().toString();
  const amountType = input.amountType || 'portions';

  if (input.foodId) {
    const food = await db.collection('foods').findOne({
      _id: toObjectId(input.foodId),
      ...userQuery()
    });

    if (!food) throw new Error(`Food not found: ${input.foodId}`);

    const amount = calculateFoodAmount(food, input);
    const macros = nutritionSnapshot(food, amount.factor);

    return {
      id: itemId,
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
      isNewFood: false,
      saveAsFood: false,
      nutritionConfidence: input.nutritionConfidence || 'exact',
      proteinType: input.proteinType || null,
      pairingTags: Array.isArray(input.pairingTags) ? input.pairingTags : []
    };
  }

  const foodName = requireString(input.foodName, 'foodName');
  const calories = round(num(input.calories, 0));
  const protein = round(num(input.protein, 0));
  const fat = round(num(input.fat, 0));
  const carbs = round(num(input.carbs, 0));

  let savedFood = null;

  if (input.saveAsFood && foodName) {
    savedFood = await upsertProduct({
      name: foodName,
      calories,
      protein,
      fat,
      carbs,
      per100g: amountType === 'grams',
      portionName: input.portionName || null,
      defaultAmount: num(input.amount, 1),
      defaultAmountType: amountType,
      source: 'quickMeal'
    });
  }

  return {
    id: itemId,
    foodId: savedFood?.id || null,
    foodName,
    foodType: savedFood ? 'product' : 'product',
    amountType,
    amount: round(num(input.amount, 1)),
    grams: nullableNum(input.grams),
    portions: nullableNum(input.portions),
    fraction: nullableNum(input.fraction),
    portionName: input.portionName || null,
    calories,
    protein,
    fat,
    carbs,
    isNewFood: true,
    saveAsFood: !!input.saveAsFood,
    nutritionConfidence: input.nutritionConfidence || 'unknown',
    proteinType: input.proteinType || null,
    pairingTags: Array.isArray(input.pairingTags) ? input.pairingTags : []
  };
}

async function buildDiaryEntry(body = {}, existing = {}) {
  const merged = { ...existing, ...body };
  const date = dateStringFrom(merged.date);
  const quick = !!merged.quick;

  if (merged.foodId && !merged.caloriesProvided) {
    const food = await db.collection('foods').findOne({
      _id: toObjectId(merged.foodId),
      ...userQuery()
    });

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
      mealEventId: merged.mealEventId || null,
      sourceFoodSnapshot: mapDoc(food),
      time: existing.time || now(),
      updatedAt: now()
    };
  }

  const grams = nullableNum(merged.grams);
  const portions = nullableNum(merged.portions);
  const fraction = nullableNum(merged.fraction);
  const amountType = merged.amountType || (grams != null ? 'grams' : portions != null ? 'portions' : fraction != null ? 'fraction' : 'manual');

  return {
    userId: merged.userId || DEFAULT_USER_ID,
    foodId: merged.foodId || null,
    foodName: requireString(merged.foodName, 'foodName'),
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
    mealEventId: merged.mealEventId || null,
    time: existing.time || now(),
    updatedAt: now()
  };
}

async function connect() {
  if (!MONGO_URI) throw new Error('MONGO_URI is missing');

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db(DB_NAME);

  await db.collection('foods').createIndex({ userId: 1, type: 1, normalizedName: 1 }, { unique: false });
  await db.collection('foods').createIndex({ userId: 1, name: 1 });
  await db.collection('foods').createIndex({ userId: 1, useCount: -1, lastUsed: -1 });
  await db.collection('mealEvents').createIndex({ userId: 1, date: 1, timestamp: 1 });
  await db.collection('diary').createIndex({ userId: 1, date: 1, time: 1 });
  await db.collection('weight').createIndex({ userId: 1, date: 1 }, { unique: false });
  await db.collection('presets').createIndex({ userId: 1, createdAt: 1 });
  await db.collection('settings').createIndex({ userId: 1 });

  const settings = await db.collection('settings').findOne({ _id: 'main' });

  if (!settings) {
    await db.collection('settings').insertOne({
      _id: 'main',
      userId: DEFAULT_USER_ID,
      dailyCalories: 1800,
      dailyProtein: 130,
      dailyFat: 60,
      dailyCarbs: 180,
      goalMode: 'recomposition',
      strictness: 'moderate',
      createdAt: now(),
      updatedAt: now()
    });
  } else {
    await db.collection('settings').updateOne(
      { _id: 'main' },
      {
        $set: {
          dailyCalories: round(num(settings.dailyCalories, 1800)),
          dailyProtein: round(num(settings.dailyProtein, 130)),
          dailyFat: round(num(settings.dailyFat, 60)),
          dailyCarbs: round(num(settings.dailyCarbs, 180)),
          goalMode: settings.goalMode || 'recomposition',
          strictness: settings.strictness || 'moderate',
          updatedAt: now()
        }
      }
    );
  }

  console.log(`MongoDB connected: ${DB_NAME}`);
}

// MARK: - Health

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    db: !!db,
    userId: DEFAULT_USER_ID,
    time: isoNow()
  });
});

// MARK: - Settings

app.get('/api/settings', asyncHandler(async (req, res) => {
  const settings = await db.collection('settings').findOne({ _id: 'main' });

  res.json({
    dailyCalories: round(num(settings?.dailyCalories, 1800)),
    dailyProtein: round(num(settings?.dailyProtein, 130)),
    dailyFat: round(num(settings?.dailyFat, 60)),
    dailyCarbs: round(num(settings?.dailyCarbs, 180)),
    goalMode: settings?.goalMode || 'recomposition',
    strictness: settings?.strictness || 'moderate'
  });
}));

app.put('/api/settings', asyncHandler(async (req, res) => {
  const patch = { updatedAt: now() };

  if (req.body.dailyCalories !== undefined) patch.dailyCalories = round(num(req.body.dailyCalories, 1800));
  if (req.body.dailyProtein !== undefined) patch.dailyProtein = round(num(req.body.dailyProtein, 130));
  if (req.body.dailyFat !== undefined) patch.dailyFat = round(num(req.body.dailyFat, 60));
  if (req.body.dailyCarbs !== undefined) patch.dailyCarbs = round(num(req.body.dailyCarbs, 180));
  if (req.body.goalMode !== undefined) patch.goalMode = str(req.body.goalMode, 'recomposition');
  if (req.body.strictness !== undefined) patch.strictness = str(req.body.strictness, 'moderate');

  await db.collection('settings').updateOne(
    { _id: 'main' },
    {
      $set: patch,
      $setOnInsert: {
        _id: 'main',
        userId: DEFAULT_USER_ID,
        createdAt: now()
      }
    },
    { upsert: true }
  );

  const saved = await db.collection('settings').findOne({ _id: 'main' });

  res.json({
    dailyCalories: round(num(saved.dailyCalories, 1800)),
    dailyProtein: round(num(saved.dailyProtein, 130)),
    dailyFat: round(num(saved.dailyFat, 60)),
    dailyCarbs: round(num(saved.dailyCarbs, 180)),
    goalMode: saved.goalMode || 'recomposition',
    strictness: saved.strictness || 'moderate'
  });
}));

// MARK: - Foods

app.get('/api/foods', asyncHandler(async (req, res) => {
  const query = userQuery();

  if (req.query.type === 'product' || req.query.type === 'recipe') {
    query.type = req.query.type;
  }

  const foods = await db.collection('foods')
    .find(query)
    .sort({ isFavorite: -1, useCount: -1, name: 1 })
    .toArray();

  res.json(foods.map(mapDoc));
}));

app.get('/api/foods/suggest', asyncHandler(async (req, res) => {
  const q = normalizeName(req.query.q || '');
  const limit = Math.min(Math.max(parseInt(req.query.limit || '8', 10), 1), 20);

  if (!q) return res.json([]);

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startsWithRegex = new RegExp(`^${escaped}`, 'i');
  const containsRegex = new RegExp(escaped, 'i');

  const exact = await db.collection('foods').find({
    ...userQuery(),
    type: { $in: ['recipe', 'product'] },
    normalizedName: q
  })
    .sort({ type: 1, useCount: -1, lastUsed: -1, name: 1 })
    .limit(limit)
    .toArray();

  const exactIds = exact.map(item => item._id);

  const startsWith = await db.collection('foods').find({
    ...userQuery(),
    type: { $in: ['recipe', 'product'] },
    normalizedName: { $regex: startsWithRegex },
    _id: { $nin: exactIds }
  })
    .sort({ useCount: -1, lastUsed: -1, name: 1 })
    .limit(Math.max(limit - exact.length, 0))
    .toArray();

  const usedIds = exact.concat(startsWith).map(item => item._id);

  const contains = await db.collection('foods').find({
    ...userQuery(),
    type: { $in: ['recipe', 'product'] },
    normalizedName: { $regex: containsRegex },
    _id: { $nin: usedIds }
  })
    .sort({ useCount: -1, lastUsed: -1, name: 1 })
    .limit(Math.max(limit - exact.length - startsWith.length, 0))
    .toArray();

  res.json([...exact, ...startsWith, ...contains].map(mapDoc));
}));



app.get('/api/foods/:id', asyncHandler(async (req, res) => {
  const food = await db.collection('foods').findOne({
    _id: toObjectId(req.params.id),
    ...userQuery()
  });

  if (!food) return res.status(404).json({ error: 'Food not found' });

  res.json(mapDoc(food));
}));

app.post('/api/foods', asyncHandler(async (req, res) => {
  const food = normalizeFood(req.body);
  const result = await db.collection('foods').insertOne(food);
  const saved = await db.collection('foods').findOne({ _id: result.insertedId });
  res.json(mapDoc(saved));
}));

app.post('/api/foods/upsert', asyncHandler(async (req, res) => {
  const saved = await upsertProduct({
    name: req.body.name,
    calories: req.body.calories,
    protein: req.body.protein,
    fat: req.body.fat,
    carbs: req.body.carbs,
    per100g: req.body.per100g !== false,
    portionName: req.body.portionName || null,
    defaultAmount: req.body.defaultAmount,
    defaultAmountType: req.body.defaultAmountType,
    source: req.body.source || 'manual'
  });

  res.json(saved);
}));

app.put('/api/foods/:id', asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.id);

  const existing = await db.collection('foods').findOne({
    _id,
    ...userQuery()
  });

  if (!existing) return res.status(404).json({ error: 'Food not found' });

  const normalized = normalizeFood(req.body, existing);

  await db.collection('foods').replaceOne({ _id }, normalized);

  const saved = await db.collection('foods').findOne({ _id });
  res.json(mapDoc(saved));
}));

app.patch('/api/foods/:id', asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.id);

  const existing = await db.collection('foods').findOne({
    _id,
    ...userQuery()
  });

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

app.post('/api/foods/import', asyncHandler(async (req, res) => {
  if (!Array.isArray(req.body)) throw new Error('Body must be an array');

  let inserted = 0;

  for (const item of req.body) {
    const payload = normalizeFood({
      ...item,
      source: item.source || 'importBatch'
    });

    await db.collection('foods').insertOne(payload);
    inserted += 1;
  }

  res.json({ inserted });
}));

app.delete('/api/foods/:id', asyncHandler(async (req, res) => {
  await db.collection('foods').deleteOne({
    _id: toObjectId(req.params.id),
    ...userQuery()
  });

  res.json({ ok: true });
}));

// MARK: - Recipes

app.post('/api/recipes', asyncHandler(async (req, res) => {
  const inputIngredients = Array.isArray(req.body.ingredients) ? req.body.ingredients : [];
  const savedIngredientFoods = [];
  const normalizedIngredients = [];

  for (const rawIngredient of inputIngredients) {
    const ingredient = normalizeIngredient(rawIngredient);

    let foodId = ingredient.foodId || null;

    if (!foodId && ingredient.name && (
      ingredient.caloriesPer100g > 0 ||
      ingredient.proteinPer100g > 0 ||
      ingredient.fatPer100g > 0 ||
      ingredient.carbsPer100g > 0
    )) {
      const savedFood = await upsertProduct({
        name: ingredient.name,
        normalizedName: ingredient.normalizedName,
        calories: ingredient.caloriesPer100g,
        protein: ingredient.proteinPer100g,
        fat: ingredient.fatPer100g,
        carbs: ingredient.carbsPer100g,
        per100g: true,
        source: 'recipeIngredient',
        defaultAmount: 100,
        defaultAmountType: 'grams'
      });

      foodId = savedFood.id;
      savedIngredientFoods.push(savedFood);
    }

    normalizedIngredients.push({
      ...ingredient,
      foodId,
      saveStatus: foodId ? 'saved' : 'skipped'
    });
  }

  const recipe = normalizeFood({
    ...req.body,
    type: 'recipe',
    ingredients: normalizedIngredients,
    source: 'manual'
  });

  const result = await db.collection('foods').insertOne(recipe);
  const savedRecipe = mapDoc(await db.collection('foods').findOne({ _id: result.insertedId }));

  res.json({
    recipe: savedRecipe,
    savedIngredientFoods
  });
}));

// MARK: - Meal Events

app.get('/api/meals', asyncHandler(async (req, res) => {
  const date = dateStringFrom(req.query.date);

  const meals = await db.collection('mealEvents')
    .find(userQuery({ date }))
    .sort({ timestamp: 1, createdAt: 1 })
    .toArray();

  res.json(meals.map(mapDoc));
}));

app.post('/api/meals', asyncHandler(async (req, res) => {
  const date = dateStringFrom(req.body.date);
  const timestamp = req.body.timestamp || now().toISOString();
  const mealType = req.body.mealType || detectMealType(timestamp);
  const source = req.body.source || 'quickPlus';

  const inputItems = Array.isArray(req.body.items) ? req.body.items : [];
  if (!inputItems.length) throw new Error('Meal must have at least one item');

  const items = [];

  for (const rawItem of inputItems) {
    items.push(await normalizeMealItem(rawItem));
  }

  const totals = cleanTotals(macroTotals(items));

  const mealEvent = {
    userId: DEFAULT_USER_ID,
    date,
    timestamp,
    mealType,
    source,
    title: req.body.title || null,
    items,
    totals,
    createdAt: now(),
    updatedAt: now()
  };

  const result = await db.collection('mealEvents').insertOne(mealEvent);
  const saved = await db.collection('mealEvents').findOne({ _id: result.insertedId });
  const mealId = result.insertedId.toString();

  const legacyEntries = items.map(item => ({
    userId: DEFAULT_USER_ID,
    foodId: item.foodId,
    foodName: item.foodName,
    foodType: item.foodType || 'product',
    amountType: item.amountType,
    amount: item.amount,
    grams: item.grams,
    portions: item.portions,
    fraction: item.fraction,
    portionName: item.portionName,
    calories: item.calories,
    protein: item.protein,
    fat: item.fat,
    carbs: item.carbs,
    date,
    quick: source === 'quickPlus',
    mealEventId: mealId,
    time: new Date(timestamp),
    updatedAt: now()
  }));

  if (legacyEntries.length) {
    await db.collection('diary').insertMany(legacyEntries);
  }

  for (const item of items) {
    if (!item.foodId) continue;

    await db.collection('foods').updateOne(
      { _id: toObjectId(item.foodId) },
      {
        $inc: { useCount: 1 },
        $set: { lastUsed: date, updatedAt: now() }
      }
    );
  }

  res.json(mapDoc(saved));
}));

app.delete('/api/meals/:id', asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.id);

  await db.collection('mealEvents').deleteOne({
    _id,
    ...userQuery()
  });

  await db.collection('diary').deleteMany({
    userId: DEFAULT_USER_ID,
    mealEventId: req.params.id
  });

  res.json({ ok: true });
}));

// MARK: - Legacy Diary

app.get('/api/diary', asyncHandler(async (req, res) => {
  const date = req.query.date ? str(req.query.date) : null;
  const query = userQuery(date ? { date } : {});

  const entries = await db.collection('diary')
    .find(query)
    .sort({ time: 1 })
    .toArray();

  res.json(entries.map(mapDoc));
}));

app.get('/api/diary/dates', asyncHandler(async (req, res) => {
  const diaryDates = await db.collection('diary').distinct('date', userQuery());
  const mealDates = await db.collection('mealEvents').distinct('date', userQuery());

  const merged = Array.from(new Set([...diaryDates, ...mealDates]))
    .filter(Boolean)
    .sort()
    .reverse();

  res.json(merged);
}));

app.post('/api/diary', asyncHandler(async (req, res) => {
  const body = { ...req.body };

  if (req.body.calories !== undefined && !req.body.amountType) {
    body.caloriesProvided = true;
  }

  const entry = await buildDiaryEntry(body);
  const result = await db.collection('diary').insertOne(entry);
  const saved = await db.collection('diary').findOne({ _id: result.insertedId });

  res.json(mapDoc(saved));
}));

app.put('/api/diary/:id', asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.id);

  const existing = await db.collection('diary').findOne({
    _id,
    ...userQuery()
  });

  if (!existing) return res.status(404).json({ error: 'Diary entry not found' });

  const shouldRecalculate = req.body.foodId ||
    existing.foodId ||
    req.body.amountType ||
    req.body.amount !== undefined ||
    req.body.grams !== undefined ||
    req.body.portions !== undefined ||
    req.body.fraction !== undefined;

  const body = { ...existing, ...req.body };

  if (!shouldRecalculate || (req.body.calories !== undefined && !req.body.foodId && !req.body.amountType)) {
    body.caloriesProvided = true;
  }

  const normalized = await buildDiaryEntry(body, existing);

  await db.collection('diary').replaceOne({ _id }, normalized);

  const saved = await db.collection('diary').findOne({ _id });

  res.json(mapDoc(saved));
}));

app.delete('/api/diary/:id', asyncHandler(async (req, res) => {
  await db.collection('diary').deleteOne({
    _id: toObjectId(req.params.id),
    ...userQuery()
  });

  res.json({ ok: true });
}));

// MARK: - Weight

app.get('/api/weight', asyncHandler(async (req, res) => {
  const weights = await db.collection('weight')
    .find(userQuery())
    .sort({ date: 1 })
    .toArray();

  res.json(weights.map(mapDoc));
}));

app.post('/api/weight', asyncHandler(async (req, res) => {
  const date = requireString(req.body.date, 'date');
  const kg = round(num(req.body.kg, 0));

  if (kg <= 0) throw new Error('kg must be positive');

  await db.collection('weight').updateOne(
    { userId: DEFAULT_USER_ID, date },
    {
      $set: {
        userId: DEFAULT_USER_ID,
        date,
        kg,
        updatedAt: now()
      },
      $setOnInsert: {
        createdAt: now()
      }
    },
    { upsert: true }
  );

  res.json({ ok: true });
}));

app.delete('/api/weight/:date', asyncHandler(async (req, res) => {
  await db.collection('weight').deleteOne({
    userId: DEFAULT_USER_ID,
    date: req.params.date
  });

  res.json({ ok: true });
}));

// MARK: - Stats

app.get('/api/stats/week', asyncHandler(async (req, res) => {
  const today = new Date();
  const days = [];

  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }

  const meals = await db.collection('mealEvents')
    .find(userQuery({ date: { $in: days } }))
    .toArray();

  const diary = await db.collection('diary')
    .find(userQuery({
      date: { $in: days },
      mealEventId: { $exists: false }
    }))
    .toArray();

  const result = days.map(date => {
    const dayMeals = meals.filter(item => item.date === date);
    const dayDiary = diary.filter(item => item.date === date);

    const mealTotals = dayMeals.reduce((acc, meal) => {
      acc.calories += num(meal.totals?.calories);
      acc.protein += num(meal.totals?.protein);
      acc.fat += num(meal.totals?.fat);
      acc.carbs += num(meal.totals?.carbs);
      return acc;
    }, { calories: 0, protein: 0, fat: 0, carbs: 0 });

    const diaryTotals = dayDiary.reduce((acc, entry) => {
      acc.calories += num(entry.calories);
      acc.protein += num(entry.protein);
      acc.fat += num(entry.fat);
      acc.carbs += num(entry.carbs);
      return acc;
    }, { calories: 0, protein: 0, fat: 0, carbs: 0 });

    return {
      date,
      calories: round(mealTotals.calories + diaryTotals.calories),
      protein: round(mealTotals.protein + diaryTotals.protein),
      fat: round(mealTotals.fat + diaryTotals.fat),
      carbs: round(mealTotals.carbs + diaryTotals.carbs)
    };
  });

  res.json(result);
}));

// MARK: - Presets

app.get('/api/presets', asyncHandler(async (req, res) => {
  const presets = await db.collection('presets')
    .find(userQuery())
    .sort({ useCount: -1, createdAt: 1 })
    .toArray();

  res.json(presets.map(mapDoc));
}));

app.post('/api/presets', asyncHandler(async (req, res) => {
  const name = requireString(req.body.name, 'name');
  const emoji = str(req.body.emoji, '🍽️');

  const items = Array.isArray(req.body.items)
    ? req.body.items.map(item => ({
      foodId: str(item.foodId),
      foodName: str(item.foodName),
      amount: round(num(item.amount, 1)),
      amountType: str(item.amountType, 'grams')
    })).filter(item => item.foodId)
    : [];

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
  const saved = await db.collection('presets').findOne({ _id: result.insertedId });

  res.json(mapDoc(saved));
}));

app.patch('/api/presets/:id', asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.id);

  const existing = await db.collection('presets').findOne({
    _id,
    ...userQuery()
  });

  if (!existing) return res.status(404).json({ error: 'Preset not found' });

  const patch = { updatedAt: now() };

  if (req.body.name !== undefined) patch.name = requireString(req.body.name, 'name');
  if (req.body.emoji !== undefined) patch.emoji = str(req.body.emoji);
  if (req.body.useCount !== undefined) patch.useCount = Math.max(0, num(req.body.useCount, 0));

  await db.collection('presets').updateOne({ _id }, { $set: patch });

  const saved = await db.collection('presets').findOne({ _id });

  res.json(mapDoc(saved));
}));

app.delete('/api/presets/:id', asyncHandler(async (req, res) => {
  await db.collection('presets').deleteOne({
    _id: toObjectId(req.params.id),
    ...userQuery()
  });

  res.json({ ok: true });
}));

connect()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(error => {
    console.error('MongoDB connection failed:', error);
    process.exit(1);
  });