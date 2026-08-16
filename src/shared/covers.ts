const coverNumbers = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24] as const

export const BUILT_IN_COVERS = coverNumbers.map(number => ({
  src: `./assets/covers/coolnote-cover-${String(number).padStart(2,'0')}.png`,
  label: `内置封面 ${number}`,
}))
