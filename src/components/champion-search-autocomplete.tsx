"use client"

import { useEffect, useMemo, useState } from "react"
import { Search } from "lucide-react"

import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { InputGroupButton } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import {
  loadChampionDirectory,
  searchChampionDirectory,
  type ChampionDirectoryEntry,
} from "@/lib/champion-pages"

const MAX_AUTOCOMPLETE_RESULTS = 8

type ChampionSearchAutocompleteProps = {
  ariaLabel: string
  id: string
  isSearching: boolean
  value: string
  onChampionSelect: (champion: ChampionDirectoryEntry) => void
  onValueChange: (value: string) => void
}

export function ChampionSearchAutocomplete({
  ariaLabel,
  id,
  isSearching,
  value,
  onChampionSelect,
  onValueChange,
}: ChampionSearchAutocompleteProps) {
  const [champions, setChampions] = useState<ChampionDirectoryEntry[]>([])

  useEffect(() => {
    let cancelled = false

    void loadChampionDirectory()
      .then((nextChampions) => {
        if (!cancelled) {
          setChampions(nextChampions)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChampions([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const suggestions = useMemo(
    () => searchChampionDirectory(value, champions, MAX_AUTOCOMPLETE_RESULTS),
    [champions, value]
  )

  return (
    <Combobox<ChampionDirectoryEntry>
      items={suggestions}
      filteredItems={suggestions}
      inputValue={value}
      autoHighlight
      itemToStringLabel={(champion) => champion.displayName}
      isItemEqualToValue={(left, right) => left.championId === right.championId}
      onInputValueChange={onValueChange}
      onValueChange={(champion) => {
        if (champion) {
          onChampionSelect(champion)
        }
      }}
    >
      <ComboboxInput
        id={id}
        type="search"
        placeholder="Search champion"
        autoComplete="off"
        spellCheck={false}
        aria-label={ariaLabel}
        className="rift-home-search h-14"
        showTrigger={false}
        endContent={
          <InputGroupButton
            type="submit"
            variant="default"
            size="icon-sm"
            className="rift-search-submit rift-search-submit--solid"
            aria-label="Search"
            disabled={isSearching}
          >
            {isSearching ? <Spinner className="size-4" /> : <Search />}
          </InputGroupButton>
        }
      />

      {value.trim() ? (
        <ComboboxContent
          side="bottom"
          sideOffset={12}
          collisionAvoidance={{
            side: "none",
            align: "shift",
            fallbackAxisSide: "none",
          }}
        >
          <ComboboxEmpty>No champion found.</ComboboxEmpty>
          <ComboboxList>
            <ComboboxCollection>
              {(champion: ChampionDirectoryEntry) => (
                <ComboboxItem key={champion.championId} value={champion}>
                  {champion.avatarUrl ? (
                    <img
                      src={champion.avatarUrl}
                      alt=""
                      className="size-9 shrink-0 rounded-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                      {champion.displayName.slice(0, 1)}
                    </div>
                  )}
                  <span className="truncate">{champion.displayName}</span>
                </ComboboxItem>
              )}
            </ComboboxCollection>
          </ComboboxList>
        </ComboboxContent>
      ) : null}
    </Combobox>
  )
}
