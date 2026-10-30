"use client";

import { flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, useReactTable, type ColumnDef, type PaginationState } from "@tanstack/react-table";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { WalletSummary } from "../wallet-transport";
import { singaporeDateTime, walletHoldHref } from "./wallet-activity";
import styles from "./wallet-view.module.css";

type Hold = WalletSummary["activeHolds"][number];
const emptyHolds: Hold[] = [];
const PAGE_SIZE = 8;

function holdStatus(hold: Hold) {
  return hold.heldCents < hold.originalCents ? "Partially held" : "Booking hold";
}

const columns: ColumnDef<Hold>[] = [
  {
    id: "booking", header: "Booking",
    accessorFn: (hold) => hold.venueName ?? "Session",
    cell: ({ row: { original: hold } }) => <div className={styles.holdBooking}>
      <span className={styles.holdPhoto} data-surface={hold.sport === "Tennis" ? "clay" : "grass"} aria-hidden="true">
        <Image src={hold.sport === "Tennis" ? "/images/sports/tennis.jpg" : "/images/landing-court.webp"} fill sizes="64px" alt="" />
      </span>
      <div>
        <p className={styles.holdBookingName}>{hold.venueName ?? "Session"}</p>
        {hold.startAt && <p><time dateTime={hold.startAt}>{singaporeDateTime.format(new Date(hold.startAt))}</time></p>}
        {hold.sport && <p>{hold.sport}</p>}
      </div>
    </div>,
  },
  {
    id: "status", header: "Status", accessorFn: holdStatus,
    cell: ({ row: { original: hold } }) => <span className={styles.holdStatus} data-partial={hold.heldCents < hold.originalCents}>
      <Clock3 size={14} strokeWidth={1.5} aria-hidden="true" />{holdStatus(hold)}
    </span>,
  },
  {
    accessorKey: "heldCents", header: "Amount",
    cell: ({ row: { original: hold } }) => <div className={styles.holdTableAmount}>
      <Money cents={hold.heldCents} />
      {hold.heldCents !== hold.originalCents && <p>of <Money cents={hold.originalCents} /></p>}
    </div>,
  },
  {
    id: "session", header: () => <span className="sr-only">Session</span>,
    cell: ({ row: { original: hold } }) => <Button asChild variant="ghost" size="icon" className={styles.holdTableAction}>
      <Link href={walletHoldHref(hold)} aria-label={`View ${hold.venueName ?? "session"}`}><ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" /></Link>
    </Button>,
  },
];

/** Keeps hold controls and rows together while the activity header owns their placement. */
export function useWalletHoldsTable(holds: WalletSummary["activeHolds"] = emptyHolds) {
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState("all");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZE });
  const globalFilter = useMemo(() => ({ search: search.trim().toLocaleLowerCase("en-SG"), days: dateRange }), [search, dateRange]);
  const table = useReactTable({
    data: holds, columns, getRowId: (hold) => hold.holdId,
    state: { pagination, globalFilter }, onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
    globalFilterFn: (row, _columnId, filter: typeof globalFilter) => {
      const hold = row.original;
      const start = hold.startAt ? new Date(hold.startAt) : null;
      const text = `${hold.venueName ?? "Session"} ${hold.sport ?? ""} ${start ? singaporeDateTime.format(start) : ""} ${holdStatus(hold)}`.toLocaleLowerCase("en-SG");
      const untilStart = start ? start.getTime() - Date.now() : null;
      return text.includes(filter.search) && (filter.days === "all"
        || (untilStart !== null && untilStart >= 0 && untilStart <= Number(filter.days) * 86_400_000));
    },
  });
  const count = table.getFilteredRowModel().rows.length;
  const lastPage = Math.max(0, table.getPageCount() - 1);
  useEffect(() => {
    if (pagination.pageIndex > lastPage) table.setPageIndex(lastPage);
  }, [pagination.pageIndex, lastPage, table]);

  function changeSearch(value: string) {
    setSearch(value);
    table.setPageIndex(0);
  }

  function changeDateRange(value: string) {
    setDateRange(value);
    table.setPageIndex(0);
  }

  const first = count === 0 ? 0 : pagination.pageIndex * PAGE_SIZE + 1;
  const last = Math.min((pagination.pageIndex + 1) * PAGE_SIZE, count);
  return {
    controls: holds.length > 0 ? <div className={`${styles.filters} ${styles.holdsFilters}`}>
      <div className={styles.search}>
        <Search size={16} aria-hidden="true" />
        <Input aria-label="Search active holds" placeholder="Search holds…" value={search} onChange={(event) => changeSearch(event.target.value)} />
      </div>
      <Select value={dateRange} onValueChange={changeDateRange}>
        <SelectTrigger aria-label="Session date range" className={styles.typeFilter}><CalendarDays size={16} aria-hidden="true" /><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All dates</SelectItem>
          <SelectItem value="30">Next 30 days</SelectItem>
          <SelectItem value="90">Next 90 days</SelectItem>
        </SelectContent>
      </Select>
    </div> : null,
    content: holds.length === 0
      ? <EmptyState title="Nothing held right now" description="When you join a session, its share is held here until attendance is verified." />
      : <>
        <div className={styles.tableScroller} tabIndex={0} role="region" aria-label="Active holds table">
          <table className={`${styles.dataTable} ${styles.holdsTable}`} aria-label="Active holds">
            <caption className="sr-only">Active session fund holds. All dates and times are in Singapore time.</caption>
            <thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>
              {group.headers.map((header) => <th key={header.id} scope="col">{flexRender(header.column.columnDef.header, header.getContext())}</th>)}
            </tr>)}</thead>
            <tbody>{table.getRowModel().rows.map((row) => <tr key={row.id}>
              {row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
        {count === 0 && <div className={styles.noResults}>
          <EmptyState title="No matching holds" description="Try another search or session date range." />
          <Button variant="outline" onClick={() => { changeSearch(""); changeDateRange("all"); }}>Clear hold filters</Button>
        </div>}
        <div className={styles.pagination}>
          <p aria-live="polite">Showing {first}–{last} of {count} active {count === 1 ? "hold" : "holds"}</p>
          <nav aria-label="Active hold pages">
            <Button variant="ghost" size="icon" aria-label="Previous holds page" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}><ChevronLeft aria-hidden="true" /></Button>
            {table.getPageOptions().filter((page) => Math.abs(page - pagination.pageIndex) <= 2).map((page) => <Button key={page} variant="ghost" aria-label={`Holds page ${page + 1}`} aria-current={pagination.pageIndex === page ? "page" : undefined} className={styles.pageButton} onClick={() => table.setPageIndex(page)}>{page + 1}</Button>)}
            <Button variant="ghost" size="icon" aria-label="Next holds page" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}><ChevronRight aria-hidden="true" /></Button>
          </nav>
        </div>
      </>,
  };
}
