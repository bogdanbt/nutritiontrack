require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
app.use(cors());
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = 'nutritrack';

let db;

async function connect() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db(DB_NAME);
  console.log('MongoDB connected');

  const settings = await db.collection('settings').findOne({ _id: 'main' });
  if (!settings) {
    await db.collection('settings').insertOne({
      _id: 'main',
      dailyCalories: 1800,
      dailyProtein: 130
    });
  }
}

// Settings
app.get('/api/settings', async (req, res) => {
  try {
    const s = await db.collection('settings').findOne({ _id: 'main' });
    res.json({ dailyCalories: s.dailyCalories, dailyProtein: s.dailyProtein });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/settings', async (req, res) => {
  try {
    await db.collection('settings').updateOne({ _id: 'main' }, { $set: req.body });
    const s = await db.collection('settings').findOne({ _id: 'main' });
    res.json({ dailyCalories: s.dailyCalories, dailyProtein: s.dailyProtein });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Foods
app.get('/api/foods', async (req, res) => {
  try {
    const foods = await db.collection('foods').find().sort({ createdAt: 1 }).toArray();
    res.json(foods.map(f => ({ ...f, id: f._id.toString() })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/foods', async (req, res) => {
  try {
    const food = {
      name: req.body.name,
      calories: req.body.calories,
      protein: req.body.protein || 0,
      fat: req.body.fat || 0,
      carbs: req.body.carbs || 0,
      per100g: req.body.per100g !== false,
      createdAt: new Date()
    };
    const result = await db.collection('foods').insertOne(food);
    res.json({ ...food, id: result.insertedId.toString() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/foods/import', async (req, res) => {
  try {
    const foods = req.body.map(f => ({
      name: f.name,
      calories: f.calories,
      protein: f.protein || 0,
      fat: f.fat || 0,
      carbs: f.carbs || 0,
      per100g: f.per100g !== false,
      createdAt: new Date()
    }));
    const result = await db.collection('foods').insertMany(foods);
    res.json({ inserted: result.insertedCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/foods/:id', async (req, res) => {
  try {
    await db.collection('foods').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Diary
app.get('/api/diary', async (req, res) => {
  try {
    const { date } = req.query;
    const query = date ? { date } : {};
    const entries = await db.collection('diary').find(query).sort({ time: 1 }).toArray();
    res.json(entries.map(e => ({ ...e, id: e._id.toString() })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/diary/dates', async (req, res) => {
  try {
    const dates = await db.collection('diary').distinct('date');
    res.json(dates.sort().reverse());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/diary', async (req, res) => {
  try {
    const entry = {
      foodId: req.body.foodId || null,
      foodName: req.body.foodName,
      grams: req.body.grams,
      calories: req.body.calories,
      protein: req.body.protein || 0,
      fat: req.body.fat || 0,
      carbs: req.body.carbs || 0,
      date: req.body.date,
      quick: req.body.quick || false,
      time: new Date()
    };
    const result = await db.collection('diary').insertOne(entry);
    res.json({ ...entry, id: result.insertedId.toString() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/diary/:id', async (req, res) => {
  try {
    await db.collection('diary').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Weight
app.get('/api/weight', async (req, res) => {
  try {
    const weights = await db.collection('weight').find().sort({ date: 1 }).toArray();
    res.json(weights.map(w => ({ ...w, id: w._id.toString() })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/weight', async (req, res) => {
  try {
    await db.collection('weight').updateOne(
      { date: req.body.date },
      { $set: { date: req.body.date, kg: req.body.kg } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Stats
app.get('/api/stats/week', async (req, res) => {
  try {
    const today = new Date();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }
    const entries = await db.collection('diary').find({ date: { $in: days } }).toArray();
    const result = days.map(date => {
      const de = entries.filter(e => e.date === date);
      return {
        date,
        calories: de.reduce((s, e) => s + e.calories, 0),
        protein:  de.reduce((s, e) => s + e.protein, 0),
        fat:      de.reduce((s, e) => s + e.fat, 0),
        carbs:    de.reduce((s, e) => s + e.carbs, 0),
      };
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3001;
connect()
  .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
  .catch(err => { console.error('MongoDB connection failed:', err); process.exit(1); });
