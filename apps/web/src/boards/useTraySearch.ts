import { useEffect, useRef, useState } from "react";
import type { LabelSearch } from "../search/searchParams";

export function useTraySearch(
  query: string | undefined,
  onFilters: (patch: Partial<LabelSearch>) => void,
) {
  const [draft, setDraft] = useState(query ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancel = () => clearTimeout(timer.current);
  useEffect(() => {
    cancel();
    setDraft(query ?? "");
  }, [query]);
  useEffect(() => cancel, []);
  return {
    draft,
    change: (value: string) => {
      setDraft(value);
      cancel();
      timer.current = setTimeout(
        () => onFilters({ q: value || undefined }),
        300,
      );
    },
    reset: () => {
      cancel();
      setDraft("");
    },
  };
}
