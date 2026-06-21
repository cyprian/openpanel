export function MlApiSourceCell({
  name,
}: {
  name?: string | null;
}) {
  if (!name) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <span className="block max-w-44 truncate" title={name}>
      {name}
    </span>
  );
}
