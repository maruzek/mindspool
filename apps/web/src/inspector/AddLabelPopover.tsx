import { useId, useRef, useState } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { LoaderCircleIcon, PlusIcon, SearchIcon, TagIcon } from "lucide-react";
import { api } from "@mindspool/backend/api";
import type { Id } from "@mindspool/backend/data-model";
import { Button } from "@mindspool/ui/components/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@mindspool/ui/components/combobox";
import { InputGroupAddon } from "@mindspool/ui/components/input-group";
import { errorMessage } from "../errors";
import { PAGE_SIZE } from "../library/types";

type LabelOption = {
  id: string;
  name: string;
  labelId?: Id<"labels">;
  isAssigned: boolean;
};

/** ReUI's label-selection combobox, with server search and inline creation. */
export function AddLabelPopover({ itemId }: { itemId: Id<"items"> }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  const term = search.trim();
  const { results, status, loadMore } = usePaginatedQuery(
    api.itemLabels.availableLabels,
    open ? { itemId, search: term.toLowerCase() } : "skip",
    { initialNumItems: PAGE_SIZE },
  );
  const attach = useMutation(api.itemLabels.attach);
  const remove = useMutation(api.itemLabels.remove);
  const create = useMutation(api.labels.create);
  const loading = status === "LoadingFirstPage";
  const options: LabelOption[] = results.map((label) => ({
    id: label._id,
    labelId: label._id,
    name: label.name,
    isAssigned: label.isAssigned,
  }));
  const selected = options.filter((label) => label.isAssigned);
  const canCreate =
    !loading &&
    term.length > 0 &&
    term.length <= 80 &&
    !options.some((label) => label.name.toLowerCase() === term.toLowerCase());
  if (canCreate)
    options.push({ id: "create-label", name: term, isAssigned: false });

  async function change(next: LabelOption[]) {
    if (busy.current) return;
    const changed =
      next.find((label) => !label.isAssigned) ??
      selected.find((label) => !next.some((other) => other.id === label.id));
    if (!changed) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      if (changed.labelId) {
        await (changed.isAssigned ? remove : attach)({
          itemId,
          labelId: changed.labelId,
        });
      } else {
        const labelId = await create({ name: changed.name });
        await attach({ itemId, labelId });
        setSearch("");
      }
    } catch (caught) {
      setError(
        errorMessage(
          caught,
          changed.labelId
            ? "Could not update the label."
            : "Could not create and add the label.",
        ),
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <Combobox
      multiple
      items={options}
      value={selected}
      onValueChange={(next) => void change(next)}
      isItemEqualToValue={(a, b) => a.id === b.id}
      itemToStringLabel={(label) => label.name}
      filter={null}
      autoHighlight
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSearch("");
          setError(null);
        }
      }}
      inputValue={search}
      onInputValueChange={(value, details) => {
        // Keep the query until the write succeeds, including failed creates.
        if (details.reason === "input-change") {
          setSearch(value);
          setError(null);
        }
      }}
    >
      <ComboboxTrigger
        aria-label="Add label"
        render={<Button variant="outline" size="sm" className="self-start" />}
      >
        <PlusIcon aria-hidden="true" />
        Add label
      </ComboboxTrigger>
      <ComboboxContent
        className="w-72 max-w-(--available-width)"
        aria-label="Labels"
      >
        <ComboboxInput
          aria-label="Search labels"
          placeholder="Search or create a label…"
          showTrigger={false}
          readOnly={pending}
          className="m-1 mb-0"
          aria-describedby={error ? errorId : undefined}
        >
          <InputGroupAddon>
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
        </ComboboxInput>
        {loading ? (
          <p role="status" className="px-3 py-4 text-sm text-muted-foreground">
            Loading labels…
          </p>
        ) : (
          <>
            {options.length === 0 && (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                {term
                  ? "No labels found."
                  : "Search or type a name to create a label."}
              </p>
            )}
            <ComboboxList aria-label="Labels" aria-busy={pending}>
              {(label: LabelOption) => (
                <ComboboxItem
                  key={label.id}
                  value={label}
                  disabled={pending}
                  className={
                    !label.labelId ? "border-t border-border" : undefined
                  }
                >
                  {label.labelId ? (
                    <TagIcon
                      aria-hidden="true"
                      className="size-4 text-muted-foreground"
                    />
                  ) : pending ? (
                    <LoaderCircleIcon
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                  ) : (
                    <PlusIcon aria-hidden="true" className="size-4" />
                  )}
                  <span className="min-w-0 truncate">
                    {label.labelId ? label.name : `Create “${label.name}”`}
                  </span>
                </ComboboxItem>
              )}
            </ComboboxList>
          </>
        )}
        {term.length > 80 && (
          <p className="px-3 pb-2 text-xs text-muted-foreground">
            Label names can have up to 80 characters.
          </p>
        )}
        {(status === "CanLoadMore" || status === "LoadingMore") && (
          <Button
            variant="ghost"
            size="sm"
            className="m-1"
            disabled={pending || status === "LoadingMore"}
            onClick={() => loadMore(PAGE_SIZE)}
          >
            {status === "LoadingMore" ? "Loading…" : "Show more"}
          </Button>
        )}
        {error && (
          <p
            id={errorId}
            role="alert"
            className="px-3 pb-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
      </ComboboxContent>
    </Combobox>
  );
}
