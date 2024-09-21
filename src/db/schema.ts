export type DatabaseSchema = {
  post: Post
  sub_state: SubState
  conditions: Conditions
}

export type Post = {
  uri: string
  key: string
  cid: string
  replyParent: string | null
  replyRoot: string | null
  indexedAt: string
  inputType: string | null
}

export type SubState = {
  service: string
  cursor: number
}


export type Conditions = {
  key: string
  recordName: string
  query: string
  inputRegex: string
  invertRegex: string | null
  refresh: number
  lang: string | null
  labelDisable: string | null
  replyDisable: string | null
  imageOnly: string | null
  includeAltText: string | null
  initPost: number
  pinnedPost: string | null
  lastExecTime: string | null
  feedName: string | null
  feedDescription: string | null
  limitCount: number
  privateFeed: string | null
  feedAvatar: string | null
  recordCount: number
  profileMatch: string | null
  customLabelerDid: string | null
  customLabelerLabelValues: string | null
  embedExternalUrl: string | null
  inputType: string | null
  invetListUri: string | null
  enableExactMatch: string | null
}
