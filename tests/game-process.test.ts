import { describe, expect, it } from 'vitest'
import { tasklistShowsLeagueGame } from '../src/main/game-process.js'

describe('League game process evidence', () => {
  it('accepts only a CSV task row for the actual game executable', () => {
    expect(tasklistShowsLeagueGame('"League of Legends.exe","8124","Console","1","2,014,220 K"')).toBe(true)
    expect(tasklistShowsLeagueGame('"LeagueClientUx.exe","8124","Console","1","220,000 K"')).toBe(false)
    expect(tasklistShowsLeagueGame('信息: 没有运行的任务匹配指定标准。')).toBe(false)
    expect(tasklistShowsLeagueGame('Filter: imagename eq League of Legends.exe')).toBe(false)
  })
})
