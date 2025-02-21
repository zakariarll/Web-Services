const express = require('express');
const Entry = require('../models/Entry');
const Activity = require('../models/Activity');
const moment = require('moment');
const { Parser } = require('json2csv');
const router = express.Router();

// Créer une nouvelle entrée
router.post('/', async (req, res) => {
  try {
    const { title, content, pinColor } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const newEntry = new Entry({ title, content, pinColor });
    await newEntry.save();

    // Enregistrer l'activité "create"
    const activity = new Activity({
      action: 'create',
      entryId: newEntry._id,
      details: `Created entry with title: ${title}`,
    });
    await activity.save();

    res.status(201).json(newEntry);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create entry', details: err.message });
  }
});

// Récupérer toutes les entrées actives
router.get('/', async (_req, res) => {
  try {
    const entries = await Entry.find({ status: 'Active' }); // Ne récupérer que les entrées actives
    res.status(200).json(entries);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch entries', details: err.message });
  }
});

// Modifier une entrée existante
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, pinColor } = req.body;

    // Vérifier si l'entrée existe et est active
    const entry = await Entry.findOne({ _id: id, status: 'Active' });
    if (!entry) {
      return res.status(404).json({ error: 'Entry not found or already deleted' });
    }

    // Enregistrer les anciennes valeurs pour les détails de l'activité
    const oldValues = {
      title: entry.title,
      content: entry.content,
      pinColor: entry.pinColor,
    };

    // Mettre à jour les champs fournis
    if (title) entry.title = title;
    if (content) entry.content = content;
    if (pinColor) entry.pinColor = pinColor;

    // Sauvegarder les modifications
    await entry.save();

    // Enregistrer l'activité "update"
    const activity = new Activity({
      action: 'update',
      entryId: entry._id,
      details: `Updated entry from: ${JSON.stringify(oldValues)} to: ${JSON.stringify({ title, content, pinColor })}`,
    });
    await activity.save();

    res.status(200).json(entry);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update entry', details: err.message });
  }
});

// Supprimer logiquement une entrée
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Vérifier si l'entrée existe et est active
    const entry = await Entry.findOne({ _id: id, status: 'Active' });
    if (!entry) {
      return res.status(404).json({ error: 'Entry not found or already deleted' });
    }

    // Marquer l'entrée comme supprimée
    entry.status = 'Deleted';
    await entry.save();

    // Enregistrer l'activité "delete"
    const activity = new Activity({
      action: 'delete',
      entryId: entry._id,
      details: `Deleted entry with title: ${entry.title}`,
    });
    await activity.save();

    res.status(200).json({ message: 'Entry marked as deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete entry', details: err.message });
  }
});

// Récupérer toutes les activités
router.get('/activities', async (_req, res) => {
  try {
    const activities = await Activity.find().populate('entryId', 'title');
    res.status(200).json(activities);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activities', details: err.message });
  }
});

router.get('/download-report', async (req, res) => {
  try {
    const oneWeekAgo = moment().subtract(7, 'days').toDate();
    const entries = await Entry.find({ date: { $gte: oneWeekAgo }, status: 'Active' });

    if (entries.length === 0) {
      return res.status(404).json({ error: 'No entries found for this week' });
    }

    // Transformer les dates au format désiré et séparer Date et Time
    const formattedEntries = entries.map(entry => {
      const formattedDate = moment(entry.date).format('dddd D MMMM YYYY');  // Date sans heure
      const formattedTime = moment(entry.date).format('HH:mm');            // Heure séparée

      return {
        title: entry.title,
        content: entry.content,
        date: formattedDate,  // Date seule
        time: formattedTime,  // Heure seule
      };
    });

    const fields = ['title', 'content', 'date', 'time']; // Ajout de la colonne 'time'
    const opts = { fields, delimiter: ';' };
    const parser = new Parser(opts);
    const csv = parser.parse(formattedEntries);

    // Définir les headers pour le téléchargement du fichier CSV
    res.setHeader('Content-Disposition', 'attachment; filename=journal_report.csv');  // Assurer le téléchargement avec .csv
    res.setHeader('Content-Type', 'text/csv');  // Définir le type de contenu comme CSV
    res.status(200).send(csv);  // Envoi du CSV

    // Enregistrer l'activité de téléchargement
    const activity = new Activity({
      action: 'download',
      details: 'User downloaded journal report for the week',
    });
    await activity.save();
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate report', details: err.message });
  }
});

module.exports = router;