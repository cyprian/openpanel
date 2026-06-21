import { Badge } from '@/components/ui/badge';
import { Tooltiper } from '@/components/ui/tooltip';

const DEFAULT_VISIBLE_TAGS = 3;

export function MlRunTags({
  tags,
  visibleCount = DEFAULT_VISIBLE_TAGS,
}: {
  tags: string[];
  visibleCount?: number;
}) {
  if (tags.length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }

  const visibleTags = tags.slice(0, visibleCount);
  const hiddenTags = tags.slice(visibleCount);

  return (
    <div className="flex min-w-0 max-w-[22rem] flex-wrap items-center gap-1.5">
      {visibleTags.map((tag) => (
        <Badge
          key={tag}
          className="max-w-28 truncate"
          title={tag}
          variant="outline"
        >
          {tag}
        </Badge>
      ))}
      {hiddenTags.length > 0 && (
        <Tooltiper
          asChild
          align="end"
          content={
            <div className="flex max-w-80 flex-wrap gap-1.5">
              {hiddenTags.map((tag) => (
                <Badge
                  key={tag}
                  className="max-w-64 truncate"
                  title={tag}
                  variant="outline"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          }
          side="top"
          tooltipClassName="max-w-[min(24rem,calc(100vw-2rem))]"
        >
          <button className="inline-flex" type="button">
            <Badge variant="secondary">[{hiddenTags.length} more]</Badge>
          </button>
        </Tooltiper>
      )}
    </div>
  );
}
