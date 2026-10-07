// The players' machines for the GALLERY: the game cannot ask Project 0 for the list from its sandbox, so a copy is
// taken here before each publish (the models and pictures stay on files.project0.city, where the game may read
// them). Only machines that pass the game's own rules go in. node tools/gallery_snapshot.mjs
import { writeFileSync } from 'node:fs'
import { validate } from '../experience/entity_rules.js'
const res = await fetch('https://project0.city/api/games/zer0-g/entities')
const { entities } = await res.json()
const machines = entities.filter(e => e.status === 'live' && e.model && validate(e.data).ok).map(e => ({
  id: e.id, owner: e.owner?.name ?? 'PLAYER', uid: e.owner?.uid ?? null, name: e.name ?? e.data.name, version: e.version, updated: e.updated,
  data: e.data, model: e.model, picture: e.picture ?? null,
}))
writeFileSync(new URL('../experience/assets/gallery.json', import.meta.url), JSON.stringify({ taken: Date.now(), machines }))
console.log('gallery', machines.length, 'machines:', machines.map(m => `${m.name} (${m.owner})`).join(', '))
