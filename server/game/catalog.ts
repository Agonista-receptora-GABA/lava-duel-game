import type { Card } from '@shared/types/events.ts'

export interface Category {
  id: string
  label: string
  deck: Card[]
}

const athletes: Array<[string, ...string[]]> = [
  ['lewandowski', 'lewandowski', 'robert lewandowski'],
  ['swiatek', 'świątek', 'iga świątek'],
  ['pudzian', 'pudzianowski', 'mariusz pudzianowski'],
  ['gollob', 'gollob', 'tomasz gollob'],
  ['holowczyc', 'hołowczyc', 'krzysztof hołowczyc'],
  ['malysz', 'małysz', 'adam małysz'],
  ['kubica', 'kubica', 'robert kubica'],
  ['jedrzejczak', 'jędrzejczak', 'otylia jędrzejczak'],
  ['gruszka', 'gruszka', 'piotr gruszka'],
  ['kowalczyk', 'kowalczyk', 'justyna kowalczyk'],
  ['swoboda', 'swoboda', 'ewa swoboda'],
  ['czerkawski', 'czerkawski', 'mariusz czerkawski'],
  ['zyla', 'żyła', 'piotr żyła'],
  ['korzeniowski', 'korzeniowski', 'robert korzeniowski'],
  ['szewinska', 'szewińska', 'irena szewińska'],
  ['majewski', 'majewski', 'tomasz majewski'],
  ['dudek', 'dudek', 'jerzy dudek'],
  ['ziolkowski', 'ziółkowski', 'szymon ziółkowski'],
  ['golota', 'gołota', 'andrzej gołota'],
  ['kozakiewicz', 'kozakiewicz', 'władysław kozakiewicz'],
  ['stoch', 'stoch', 'kamil stoch'],
  ['zmarzlik', 'zmarzlik', 'bartosz zmarzlik'],
  ['gortat', 'gortat', 'marcin gortat'],
  ['blachowicz', 'błachowicz', 'jan błachowicz'],
  ['szeremeta', 'szeremeta', 'julia szeremeta'],
  ['nastula', 'nastula', 'paweł nastula'],
  ['gruchala', 'gruchała', 'sylwia gruchała'],
  ['miroslaw', 'mirosław', 'aleksandra mirosław'],
  ['skolimowska', 'skolimowska', 'kamila skolimowska'],
  ['janowicz', 'janowicz', 'jerzy janowicz'],
  ['szczesny', 'szczęsny', 'wojciech szczęsny'],
  ['michalczewski', 'michalczewski', 'dariusz michalczewski'],
  ['adamek', 'adamek', 'tomasz adamek'],
  ['guzowska', 'guzowska', 'iwona guzowska'],
  ['pajor', 'pajor', 'ewa pajor'],
  ['hurkacz', 'hurkacz', 'hubert hurkacz'],
  ['szpilka', 'szpilka', 'artur szpilka'],
  ['krychowiak', 'krychowiak', 'grzegorz krychowiak'],
  ['kurek', 'kurek', 'bartosz kurek'],
  ['boruc', 'boruc', 'artur boruc'],
  ['wloszczowska', 'włoszczowska', 'maja włoszczowska'],
  ['kolecki', 'kołecki', 'szymon kołecki'],
  ['saleta', 'saleta', 'przemysław saleta'],
  ['pyrek', 'pyrek', 'monika pyrek'],
  ['szmal', 'szmal', 'sławomir szmal'],
]

const athleteDeck: Card[] = athletes.map(([image, ...aliases]) => ({
  img: `/img/polish-athletes/${image}.jpg`,
  aliases,
}))

export const categories: Category[] = [
  {
    id: 'polish-athletes',
    label: 'Polscy sportowcy',
    deck: athleteDeck,
  },
  {
    id: 'spices-and-herbs',
    label: 'Przyprawy i zioła',
    deck: [
      { img: '/img/spices-and-herbs/bazylia.jpg', aliases: ['bazylia'] },
      { img: '/img/spices-and-herbs/rozmaryn.jpg', aliases: ['rozmaryn'] },
    ],
  },
]

export interface PublicCategory {
  id: string
  label: string
}

export function listPublicCategories(): PublicCategory[] {
  return categories.map(({ id, label }) => ({ id, label }))
}

export function findCategory(id: string): Category | undefined {
  return categories.find((category) => category.id === id)
}