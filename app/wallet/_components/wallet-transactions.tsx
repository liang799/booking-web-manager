"use client";

import { flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, useReactTable, type ColumnDef, type PaginationState } from "@tanstack/react-table";
import { CalendarDays, ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorMessage } from "@/components/ui/error-message";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Money } from "@/components/ui/money";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { WalletTransactionsPage } from "../wallet-transport";
import { mobileActivityDate, tableDateTime, transactionDetails } from "./wallet-activity";
import { WalletMoney } from "./wallet-money";
import { useWalletInfiniteScroll } from "./use-wallet-infinite-scroll";
import type { WalletViewProps } from "./wallet-view";
import styles from "./wallet-view.module.css";

type Transaction = WalletTransactionsPage["items"][number];
type Props = Pick<WalletViewProps, "history" | "loadingMore" | "moreError" | "onLoadMore"> & { readonly error?: ReactNode };
const emptyTransactions: Transaction[] = [];
const PAGE_SIZE = 8;

function TransactionAmount({ transaction, mobile = false }: { readonly transaction: Transaction; readonly mobile?: boolean }) {
  const { direction } = transactionDetails[transaction.kind];
  return (
    <span className={styles.transactionAmount} data-direction={direction}>
      {direction === "in" ? "+" : direction === "out" ? "−" : ""}{mobile ? <WalletMoney cents={transaction.amountCents} /> : <Money cents={transaction.amountCents} />}
    </span>
  );
}

const columns: ColumnDef<Transaction>[] = [
  {
    accessorKey: "occurredAt", header: "Date",
    cell: ({ row }) => <time dateTime={row.original.occurredAt}>{tableDateTime.format(new Date(row.original.occurredAt))}</time>,
  },
  {
    accessorKey: "kind", header: "Type",
    cell: ({ row }) => {
      const details = transactionDetails[row.original.kind];
      const Icon = details.icon;
      return <span className={styles.tableType}><span aria-hidden="true"><Icon size={17} strokeWidth={1.6} /></span>{details.tableLabel}</span>;
    },
  },
  {
    id: "description", header: "Description",
    accessorFn: (item) => transactionDetails[item.kind].description,
  },
  {
    accessorKey: "amountCents", header: "Amount",
    cell: ({ row }) => <TransactionAmount transaction={row.original} />,
  },
];

/** One React Query history, presented as a paginated table or an infinite mobile list. */
export function WalletTransactions({ history, loadingMore, moreError, onLoadMore, error }: Props) {
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZE });
  // A next-page click may need more data. Keep the current table visible until that page is ready.
  const [requestedPage, setRequestedPage] = useState<number | null>(null);
  const data = history.status === "ready" ? history.data.items : emptyTransactions;
  const cursor = history.status === "ready" ? history.data.nextCursor : null;
  const hasMore = cursor !== null;
  const filtering = search.trim() !== "" || dateRange !== "all";
  const globalFilter = useMemo(() => ({ search: search.trim().toLocaleLowerCase("en-SG"), days: dateRange }), [search, dateRange]);
  const table = useReactTable({
    data,
    columns,
    getRowId: (item) => item.transactionId,
    state: { pagination, globalFilter },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
    globalFilterFn: (row, _columnId, filter: typeof globalFilter) => {
      const item = row.original;
      const details = transactionDetails[item.kind];
      const date = new Date(item.occurredAt);
      const text = `${details.label} ${details.tableLabel} ${details.description} ${tableDateTime.format(date)}`.toLocaleLowerCase("en-SG");
      const age = Date.now() - date.getTime();
      return text.includes(filter.search) && (filter.days === "all" || (age >= 0 && age <= Number(filter.days) * 86_400_000));
    },
  });
  const filteredRows = table.getFilteredRowModel().rows;
  const pageRows = table.getRowModel().rows;
  const pageCount = table.getPageCount();
  const lastPage = Math.max(0, pageCount - 1);
  const busy = loadingMore || requestedPage !== null;
  const currentPageIncomplete = filteredRows.length < (pagination.pageIndex + 1) * PAGE_SIZE;
  const nextPageNeedsFetch = hasMore && filteredRows.length < (pagination.pageIndex + 2) * PAGE_SIZE;

  useEffect(() => {
    if (requestedPage === null) return;
    if (moreError || history.status !== "ready") {
      setRequestedPage(null);
    } else if (filteredRows.length >= (requestedPage + 1) * PAGE_SIZE || !hasMore) {
      setPagination({ pageIndex: Math.min(requestedPage, lastPage), pageSize: PAGE_SIZE });
      setRequestedPage(null);
    } else if (!loadingMore) {
      onLoadMore();
    }
  }, [requestedPage, filteredRows.length, hasMore, lastPage, loadingMore, moreError, history.status, onLoadMore]);

  // A background refresh can remove the final cached page. Keep its selection in range.
  useEffect(() => {
    if (pagination.pageIndex > lastPage) setPagination({ pageIndex: lastPage, pageSize: PAGE_SIZE });
  }, [lastPage, pagination.pageIndex]);

  const sentinel = useWalletInfiniteScroll({
    enabled: hasMore && history.status === "ready" && !filtering,
    blocked: loadingMore || moreError !== null,
    continuationKey: cursor,
    onLoadMore,
  });

  function goToPage(index: number) {
    if (index < 0 || busy) return;
    if (hasMore && filteredRows.length < (index + 1) * PAGE_SIZE) setRequestedPage(index);
    else table.setPageIndex(index);
  }

  function changeSearch(value: string) {
    setSearch(value);
    setRequestedPage(null);
    table.setPageIndex(0);
  }

  function changeDateRange(value: string) {
    setDateRange(value);
    setRequestedPage(null);
    table.setPageIndex(0);
  }

  const firstRow = filteredRows.length === 0 ? 0 : pagination.pageIndex * PAGE_SIZE + 1;
  const lastRow = Math.min((pagination.pageIndex + 1) * PAGE_SIZE, filteredRows.length);
  const visiblePages = table.getPageOptions().filter((page) => Math.abs(page - pagination.pageIndex) <= 2);

  return (
    <section id="wallet-transactions" aria-label="Transactions" className={styles.transactions}>
      <div className={styles.activityHeader}>
        <h2 className={styles.mobileInline}>Recent activity</h2>
        <nav className={styles.sectionNav} aria-label="Wallet sections">
          <a href="#wallet-transactions" className={styles.currentSection}>All transactions</a>
          <a href="#wallet-holds">Active holds</a>
          <Link href="/payouts">Payouts</Link>
        </nav>
        {history.status === "ready" && data.length > 0 && <>
          <Button variant="ghost" className={styles.filterToggle} aria-expanded={filtersOpen} aria-controls="wallet-filters" onClick={() => setFiltersOpen((open) => !open)}>
            See all<ChevronRight aria-hidden="true" />
          </Button>
          <div id="wallet-filters" className={styles.filters} data-open={filtersOpen}>
            <div className={styles.search}>
              <Search size={16} aria-hidden="true" />
              <Input aria-label="Search transactions" placeholder="Search transactions…" value={search} onChange={(event) => changeSearch(event.target.value)} />
            </div>
            <Select value={dateRange} onValueChange={changeDateRange}>
              <SelectTrigger aria-label="Date range" className={styles.typeFilter}><CalendarDays size={16} aria-hidden="true" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>}
      </div>
      {history.status === "loading" && <LoadingSpinner label="Loading transactions…" />}
      {history.status === "error" && error}
      {history.status === "ready" && (data.length === 0
        ? <EmptyState title="No transactions yet" description="Top-ups, held shares, refunds and payouts will appear here." />
        : <>
          <div className={styles.desktopHistory} aria-busy={busy}>
            <div className={styles.tableScroller} tabIndex={0} role="region" aria-label="Transaction table">
              <table className={styles.dataTable} aria-label="Transactions">
                <caption className="sr-only">Wallet transactions. All dates and times are in Singapore time.</caption>
                <thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>
                  {group.headers.map((header) => <th key={header.id} scope="col">{flexRender(header.column.columnDef.header, header.getContext())}</th>)}
                </tr>)}</thead>
                <tbody>{pageRows.map((row) => <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}
                </tr>)}</tbody>
              </table>
            </div>
            <div className={styles.pagination}>
              <p aria-live="polite">
                Showing {firstRow}–{lastRow}{!hasMore && ` of ${filteredRows.length}`} transactions
                {hasMore && filtering && <span>Searching loaded activity. Continue to search older transactions.</span>}
              </p>
              <nav aria-label="Transaction pages">
                <Button variant="ghost" size="icon" aria-label="Previous page" disabled={!table.getCanPreviousPage() || busy} onClick={() => goToPage(pagination.pageIndex - 1)}><ChevronLeft aria-hidden="true" /></Button>
                {visiblePages.map((page) => <Button key={page} variant="ghost" aria-label={`Page ${page + 1}`} aria-current={pagination.pageIndex === page ? "page" : undefined} className={styles.pageButton}
                  disabled={busy || (moreError !== null && hasMore && filteredRows.length < (page + 1) * PAGE_SIZE)}
                  onClick={() => goToPage(page)}>{page + 1}</Button>)}
                <Button variant="ghost" size="icon" aria-label="Next page"
                  disabled={(!table.getCanNextPage() && !hasMore) || busy || (moreError !== null && nextPageNeedsFetch)}
                  onClick={() => goToPage(hasMore && currentPageIncomplete ? pagination.pageIndex : pagination.pageIndex + 1)}><ChevronRight aria-hidden="true" /></Button>
              </nav>
            </div>
            {busy && <p role="status" className={styles.loadingHint}>Loading transactions…</p>}
          </div>

          <div className={styles.mobileHistory}>
            {filteredRows.length > 0 && <ul aria-label="Transactions" className={styles.transactionList}>
              {filteredRows.map(({ original: item }) => {
                const details = transactionDetails[item.kind];
                const Icon = details.mobileIcon ?? details.icon;
                return <li key={item.transactionId} className={styles.transactionRow}>
                  <span className={styles.transactionIcon} aria-hidden="true"><Icon size={18} strokeWidth={1.6} /></span>
                  <p className={styles.transactionName}>{details.label}</p>
                  <p className={styles.transactionDate}><time dateTime={item.occurredAt}>{item.sport && `${item.sport} · `}{mobileActivityDate(item.occurredAt)}</time></p>
                  <TransactionAmount transaction={item} mobile />
                </li>;
              })}
            </ul>}
            <div ref={sentinel} className={styles.scrollSentinel} data-wallet-scroll-sentinel="">
              {filtering && hasMore && <p className={styles.loadingHint}>Search covers loaded activity. Load more to search older transactions.</p>}
              {loadingMore && <LoadingSpinner label="Loading more transactions…" />}
              {!hasMore && <p className="sr-only">You&apos;re all caught up.</p>}
              {hasMore && !loadingMore && <Button variant="outline" className={moreError || filtering ? "min-h-11" : "sr-only focus:not-sr-only focus:min-h-11"} onClick={onLoadMore}>Load more</Button>}
            </div>
          </div>
          {filteredRows.length === 0 && <div className={styles.noResults}>
            <EmptyState title="No matching transactions" description="Try another search or date range." />
            <Button variant="outline" onClick={() => { changeSearch(""); changeDateRange("all"); }}>Clear filters</Button>
          </div>}
          {moreError && <div className="mt-3">
            <ErrorMessage>{moreError}</ErrorMessage>
            <Button variant="outline" className={styles.desktopRetry} disabled={loadingMore} onClick={onLoadMore}>Retry loading transactions</Button>
          </div>}
        </>)}
    </section>
  );
}
