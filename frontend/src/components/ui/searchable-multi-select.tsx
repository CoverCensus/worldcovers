"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface SearchableMultiSelectOption {
  value: string;
  label: string;
}

interface SearchableMultiSelectProps {
  options: SearchableMultiSelectOption[];
  values: string[];
  onValuesChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  loading?: boolean;
  error?: boolean;
  errorMessage?: string;
  id?: string;
  triggerClassName?: string;
  contentClassName?: string;
  "aria-label"?: string;
}

function toggleOption(values: string[], value: string): string[] {
  if (values.includes(value)) {
    return values.filter((id) => id !== value);
  }
  return [...values, value];
}

export function SearchableMultiSelect({
  options,
  values,
  onValuesChange,
  placeholder = "Select...",
  disabled = false,
  emptyMessage = "No option found.",
  searchPlaceholder = "Search...",
  loading = false,
  error = false,
  errorMessage,
  id,
  triggerClassName,
  contentClassName,
  "aria-label": ariaLabel,
}: SearchableMultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  const selectedLabels = React.useMemo(
    () => options.filter((option) => values.includes(option.value)).map((option) => option.label),
    [options, values],
  );

  const displayLabel =
    values.length === 0
      ? placeholder
      : selectedLabels.length <= 2
        ? selectedLabels.join(", ")
        : `${selectedLabels.length} selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel ?? placeholder}
          disabled={disabled || loading}
          className={cn(
            "w-full justify-between font-normal h-10 px-3 py-2 text-sm",
            triggerClassName,
          )}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              Loading...
            </span>
          ) : error ? (
            <span className="text-destructive">{errorMessage ?? "Failed to load"}</span>
          ) : (
            <span className="truncate">{displayLabel}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-[var(--radix-popover-trigger-width)] p-0", contentClassName)}
        align="start"
        sideOffset={4}
      >
        <Command shouldFilter={true}>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => onValuesChange(toggleOption(values, option.value))}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      values.includes(option.value) ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
