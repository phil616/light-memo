import { useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router";

export function useMemoFilters() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const q = params.get("q") ?? "";
  const tag = params.get("tag") ?? "";
  const rawOffset = Number(params.get("offset") ?? 0);
  const offset =
    Number.isSafeInteger(rawOffset) && rawOffset >= 0 && rawOffset <= 2147483647
      ? rawOffset
      : 0;
  const [search, setSearch] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancel = () => clearTimeout(timer.current);
  // Back/forward navigation must cancel a pending keystroke, never write it back over the URL.
  useEffect(() => {
    cancel();
    setSearch(q);
    return cancel;
  }, [location.key, q]);
  const update = (values: { q?: string; tag?: string; offset?: number }) => {
    cancel();
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(values)) {
        if (value === "" || value === 0) next.delete(key);
        else next.set(key, String(value));
      }
      return next;
    });
  };
  return {
    q,
    tag,
    offset,
    search,
    changeSearch(value: string) {
      setSearch(value);
      cancel();
      timer.current = setTimeout(() => update({ q: value, offset: 0 }), 150);
    },
    chooseTag(value: string) {
      update({ q: search, tag: value, offset: 0 });
    },
    page(value: number) {
      update({ offset: value });
    },
    clear() {
      setSearch("");
      update({ q: "", tag: "", offset: 0 });
    },
  };
}
