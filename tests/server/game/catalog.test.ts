import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { categories, findCategory, listPublicCategories } from '../../../server/game/catalog.ts'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

describe('game/catalog', () => {
  it('lists only category IDs and labels publicly', () => {
    expect(listPublicCategories()).toEqual([
      { id: 'polish-athletes', label: 'Polscy sportowcy' },
      { id: 'spices-and-herbs', label: 'Przyprawy i zioła' },
    ])
  })

  it('contains valid answerable cards whose images exist in the static client assets', () => {
    for (const category of categories) {
      expect(category.deck.length).toBeGreaterThan(0)

      for (const card of category.deck) {
        expect(card.aliases.length).toBeGreaterThan(0)
        expect(fs.existsSync(path.join(ROOT, 'public', card.img.slice(1)))).toBe(true)
      }
    }
  })

  it('looks up categories by stable ID', () => {
    expect(findCategory('spices-and-herbs')?.label).toBe('Przyprawy i zioła')
    expect(findCategory('unknown-category')).toBeUndefined()
  })
})
