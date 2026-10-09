import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';
import { applyProjectCors, requireProjectAdmin } from './project-auth.js';

const region = 'us-central1';
const collectionName = 'prospects';
const statuses = new Set(['new', 'review', 'ready_to_contact', 'contacted', 'follow_up', 'responded', 'interested', 'proposal', 'negotiation', 'client', 'not_interested', 'no_response', 'discarded']);
const fields = ['businessName', 'category', 'city', 'email', 'phone', 'website', 'facebook', 'instagram', 'contactStatus', 'channel', 'package', 'priceReference', 'proposal', 'angle', 'notes', 'firstContactAt', 'lastContactAt', 'nextFollowUpAt', 'priority', 'score', 'promotion'];

export const getProspects = onRequest({ region, invoker: 'public' }, async (req, res) => {
  if (!applyProjectCors(req, res)) return; if (req.method === 'OPTIONS') return res.status(204).send(''); if (req.method !== 'GET') return res.status(405).json({ ok: false, message: 'Método no permitido.' }); if (!await requireProjectAdmin(req, res)) return;
  try { const snapshot = await getFirestore().collection(collectionName).orderBy('updatedAt', 'desc').limit(500).get(); res.json({ ok: true, prospects: snapshot.docs.map(serialize) }); }
  catch (error) { logger.error('Prospect list failed.', error); res.status(500).json({ ok: false, message: 'No pudimos cargar la prospección.' }); }
});

export const seedProspects = onRequest({ region, invoker: 'public' }, async (req, res) => {
  if (!applyProjectCors(req, res)) return; if (req.method === 'OPTIONS') return res.status(204).send(''); if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Método no permitido.' }); if (!await requireProjectAdmin(req, res)) return;
  const seeds = Array.isArray(req.body?.prospects) ? req.body.prospects : []; if (!seeds.length || seeds.length > 20) return res.status(400).json({ ok: false, message: 'Base inicial inválida.' });
  try { const db = getFirestore(); const existing = await db.collection(collectionName).get(); const byName = new Map(existing.docs.map((doc) => [normalizeKey(doc.data().businessName), doc.ref])); const batch = db.batch(); let created = 0; let updated = 0; for (const item of seeds) { const data = normalize(item); if (!data.businessName) continue; const ref = byName.get(normalizeKey(data.businessName)) || db.collection(collectionName).doc(); batch.set(ref, { ...data, updatedAt: FieldValue.serverTimestamp(), ...(byName.has(normalizeKey(data.businessName)) ? {} : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true }); if (byName.has(normalizeKey(data.businessName))) updated += 1; else created += 1; } await batch.commit(); res.json({ ok: true, created, updated }); }
  catch (error) { logger.error('Prospect seed failed.', error); res.status(500).json({ ok: false, message: 'No pudimos cargar la base inicial.' }); }
});

export const createProspect = onRequest({ region, invoker: 'public' }, async (req, res) => {
  if (!applyProjectCors(req, res)) return; if (req.method === 'OPTIONS') return res.status(204).send(''); if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Método no permitido.' }); if (!await requireProjectAdmin(req, res)) return;
  const data = normalize(req.body); if (!data.businessName) return res.status(400).json({ ok: false, message: 'El negocio es obligatorio.' });
  try { const ref = await getFirestore().collection(collectionName).add({ ...data, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }); res.status(201).json({ ok: true, id: ref.id }); }
  catch (error) { logger.error('Prospect create failed.', error); res.status(500).json({ ok: false, message: 'No pudimos crear el prospecto.' }); }
});

export const updateProspect = onRequest({ region, invoker: 'public' }, async (req, res) => {
  if (!applyProjectCors(req, res)) return; if (req.method === 'OPTIONS') return res.status(204).send(''); if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Método no permitido.' }); if (!await requireProjectAdmin(req, res)) return;
  const id = String(req.body?.id || '').trim(); const data = normalize(req.body); if (!id || !data.businessName) return res.status(400).json({ ok: false, message: 'Prospecto inválido.' });
  try { await getFirestore().collection(collectionName).doc(id).update({ ...data, updatedAt: FieldValue.serverTimestamp() }); res.json({ ok: true }); }
  catch (error) { logger.error('Prospect update failed.', error); res.status(500).json({ ok: false, message: 'No pudimos actualizar el prospecto.' }); }
});

export const deleteProspect = onRequest({ region, invoker: 'public' }, async (req, res) => {
  if (!applyProjectCors(req, res)) return; if (req.method === 'OPTIONS') return res.status(204).send(''); if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Método no permitido.' }); if (!await requireProjectAdmin(req, res)) return;
  const id = String(req.body?.id || '').trim(); if (!id) return res.status(400).json({ ok: false, message: 'Prospecto inválido.' });
  try { await getFirestore().collection(collectionName).doc(id).delete(); res.json({ ok: true }); }
  catch (error) { logger.error('Prospect delete failed.', error); res.status(500).json({ ok: false, message: 'No pudimos eliminar el prospecto.' }); }
});

function normalize(body = {}) { const data = Object.fromEntries(fields.map((field) => [field, String(body[field] ?? '').trim()])); data.promotionEligible = body.promotionEligible === true || body.promotionEligible === 'true' || body.promotionEligible === 'on'; if (!statuses.has(data.contactStatus)) data.contactStatus = 'new'; return data; }
function normalizeKey(value) { return String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function serialize(document) { const data = document.data(); return { id: document.id, ...data, createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt) }; }
function iso(value) { return value?.toDate instanceof Function ? value.toDate().toISOString() : null; }
