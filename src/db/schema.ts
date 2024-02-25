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
}
