import type {
  AugmentMeta,
  ChampionRecommendationCard,
  ChampionRecommendationView,
  ChampionSummary,
  RecommendationDataSource,
  RecommendationDataState,
  RecommendationDetail,
} from '../shared/contracts.js'
import { dtodoRecommendationDetail } from '../shared/recommendations.js'
import type { DataService } from './data-service.js'
import type { Tencent101Adapter } from './tencent101-adapter.js'

function dtodoState(data: DataService): RecommendationDataState {
  const state = data.getState()
  return {
    source: 'dtodo',
    status: state.status,
    snapshotId: state.dataVersion,
    dataVersion: state.dataVersion,
    statisticsDate: state.publishedAt,
    stale: state.status === 'stale',
    lastError: state.lastError,
  }
}

export class RecommendationCoordinator {
  constructor(
    private readonly dtodo: DataService,
    private readonly tencent101: Tencent101Adapter,
  ) {}

  getState(source: RecommendationDataSource): RecommendationDataState {
    return source === 'dtodo' ? dtodoState(this.dtodo) : this.tencent101.getState()
  }

  getChampions(source: RecommendationDataSource): ChampionSummary[] {
    return source === 'dtodo' ? this.dtodo.getChampions() : this.tencent101.getChampions()
  }

  getAugments(source: RecommendationDataSource): AugmentMeta[] {
    return source === 'dtodo' ? this.dtodo.getAugments() : this.tencent101.getAugments()
  }

  async initialize(
    source: RecommendationDataSource,
    force = false,
    signal?: AbortSignal,
  ): Promise<RecommendationDataState> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (source === 'dtodo') {
      await this.dtodo.initialize(force)
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      return dtodoState(this.dtodo)
    }
    return this.tencent101.initialize(force, signal)
  }

  async getChampionRecommendation(
    source: RecommendationDataSource,
    championId: number,
    signal?: AbortSignal,
  ): Promise<RecommendationDetail> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (source === 'dtodo') {
      const detail = await this.dtodo.getChampionAugments(championId)
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      return dtodoRecommendationDetail(detail, this.dtodo.getState().publishedAt)
    }
    return this.tencent101.getChampionRecommendation(championId)
  }

  async getChampionView(
    source: RecommendationDataSource,
    championId: number,
    signal?: AbortSignal,
  ): Promise<ChampionRecommendationView> {
    const before = this.getState(source)
    const detail = await this.getChampionRecommendation(source, championId, signal)
    const after = this.getState(source)
    if (
      signal?.aborted || before.source !== after.source ||
      detail.snapshotId !== after.snapshotId || detail.dataVersion !== after.dataVersion ||
      detail.statisticsDate !== after.statisticsDate ||
      before.snapshotId !== after.snapshotId || before.dataVersion !== after.dataVersion ||
      before.statisticsDate !== after.statisticsDate
    ) throw new DOMException('Recommendation snapshot changed', 'AbortError')
    return this.createChampionView(source, detail)
  }

  createChampionView(
    source: RecommendationDataSource,
    detail: RecommendationDetail,
  ): ChampionRecommendationView {
    const state = this.getState(source)
    if (
      detail.source !== source || detail.snapshotId !== state.snapshotId ||
      detail.dataVersion !== state.dataVersion || detail.statisticsDate !== state.statisticsDate
    ) {
      throw new DOMException('Recommendation snapshot changed', 'AbortError')
    }
    const augments = new Map(this.getAugments(source).map((entry) => [entry.id, entry]))
    const ranks = [...detail.ranks]
      .filter((rank) => source === 'tencent101' ? rank.heroRecommendationRank != null : true)
      .sort((a, b) => {
        const aRank = a.heroRecommendationRank ?? Number.POSITIVE_INFINITY
        const bRank = b.heroRecommendationRank ?? Number.POSITIVE_INFINITY
        if (aRank !== bRank) return aRank - bRank
        return (a.globalPickRank ?? Number.POSITIVE_INFINITY) - (b.globalPickRank ?? Number.POSITIVE_INFINITY)
      })
    const cards = ranks.flatMap((rank): ChampionRecommendationCard[] => {
      const augment = augments.get(rank.augmentId)
      if (!augment) return []
      const reason = source === 'tencent101'
        ? rank.heroRecommendationRank != null
          ? `腾讯英雄推荐第 ${rank.heroRecommendationRank}`
          : rank.globalPickRank != null ? `腾讯全局排名第 ${rank.globalPickRank}` : '暂无可靠的推荐依据'
        : rank.heroRecommendationRank != null
          ? `该英雄适配度排名第 ${rank.heroRecommendationRank}`
          : rank.heroTier != null ? `该英雄适配等级为第 ${rank.heroTier} 档` : '暂无可靠的推荐依据'
      return [{
        augmentId: rank.augmentId,
        name: augment.name,
        iconUrl: augment.iconUrl,
        rarityName: augment.rarityName,
        description: augment.description,
        recommendationRank: rank.heroRecommendationRank,
        reason,
        championPickRate: rank.championPickRate,
        globalPickRate: rank.globalPickRate,
        globalWinRate: rank.globalWinRate,
        globalPickRank: rank.globalPickRank,
        globalWinRank: rank.globalWinRank,
        globalPickRankChange: rank.globalPickRankChange,
        globalWinRankChange: rank.globalWinRankChange,
      }]
    })
    return {
      source,
      championId: detail.championId,
      snapshotId: detail.snapshotId,
      dataVersion: detail.dataVersion,
      statisticsDate: detail.statisticsDate,
      stale: state.stale,
      cards,
      message: cards.length
        ? `已读取 ${cards.length} 项${source === 'tencent101' ? '腾讯英雄推荐' : '英雄推荐'}`
        : source === 'tencent101'
          ? '腾讯数据站暂无该英雄的推荐海克斯'
          : '当前数据源暂无该英雄的推荐海克斯',
    }
  }
}
