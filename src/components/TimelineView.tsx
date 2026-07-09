import type { sentenceTimeline } from '../scoring'

type TimelineItem = ReturnType<typeof sentenceTimeline>[number]

type Props = {
  timeline: TimelineItem[]
}

export function TimelineView({ timeline }: Props) {
  return (
    <div className="timeline-list">
      {timeline.map((item) => (
        <article className={`timeline-item ${item.analysis.risk}`} key={`${item.index}-${item.segment}`}>
          <span>{item.index}</span>
          <div><strong>{item.analysis.score}/100 · {item.analysis.verdict}</strong><p>{item.segment}</p></div>
        </article>
      ))}
    </div>
  )
}
