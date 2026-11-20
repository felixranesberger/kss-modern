import { card } from './card.schema.ts'
import { intro } from './intro.schema.ts'
import { fakeProps, testCases } from './fixtures.ts'

const p = fakeProps(card, { seed: 7, with: { variant: 'large', reverse: true } })
const v: 'highlight' | 'tile' | 'teaser' | 'large' | 'news' | 'bignews' | 'topnews' | 'news-slider' | 'newsroom' | 'topic' | 'small-topic' = p.variant
for (const c of testCases(intro)) {
  const t: string = c.props.title
  void t
}
void v
