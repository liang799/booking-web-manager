"use client";

import { ArrowRight, ArrowUpRight, CloudLightning, CloudRain, CloudSun, Search, Sun } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { HomeBooking, HomeState, WeatherState } from "../types";
import styles from "./home-view.module.css";

export interface HomeViewProps {
  readonly state: HomeState;
  readonly onRetry: () => void;
}

/** Synchronous Home UI. Personal bookings and the empty-state forecast are server-owned. */
export function HomeView({ state, onRetry }: HomeViewProps) {
  return (
    <div className={styles.home}>
      <header className={`${styles.hero} ${state.status === "empty" ? styles.withWeather : ""}`}>
        <Image src="/images/home-court.webp" alt="" fill priority sizes="(min-width: 1536px) calc(100vw - 272px), (min-width: 1024px) calc(100vw - 256px), (min-width: 768px) calc(100vw - 224px), 100vw" className={styles.heroArt} />
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Booking</p>
          <h1>Make time<br /> to play.</h1>
          <p className={styles.intro}>Find and join games, or host your own.<br />Good people. Great sessions.</p>
          <SessionActions />
        </div>
        {state.status === "empty" && <WeatherCard weather={state.weather} />}
      </header>
      <section className={styles.bookings} aria-labelledby="home-bookings-heading" aria-busy={state.status === "loading"}>
        <div className={styles.sectionHeading}>
          <h2 id="home-bookings-heading">Upcoming bookings</h2>
          <Link href="/sessions" className={styles.sessionsLink} aria-label="View all hosted sessions">View all <ArrowRight aria-hidden size={18} /></Link>
        </div>
        <div className={styles.bookingContent}>
          <HomeContent state={state} onRetry={onRetry} />
        </div>
      </section>
    </div>
  );
}

function HomeContent({ state, onRetry }: HomeViewProps) {
  switch (state.status) {
    case "loading":
      return <LoadingSpinner label="Loading your bookings…" />;
    case "ready":
      return (
        <ul className="grid gap-4 xl:grid-cols-2 xl:gap-5">
          {state.bookings.map((booking) => <BookingCard key={booking.sessionId} booking={booking} />)}
        </ul>
      );
    case "empty":
      return (
        <div className={styles.empty}>
          <EmptyBall />
          <h3>You have no upcoming bookings.</h3>
          <p>Find a session to join, or create your own and get playing.</p>
          <SessionActions compact />
        </div>
      );
    case "error":
      return (
        <div className={styles.error}>
          <ErrorMessage>{state.kind === "unavailable" ? "Your bookings are temporarily unavailable." : "We couldn't load your bookings. Please try again."}</ErrorMessage>
          <Button variant="outline" className="min-h-11" onClick={onRetry}>Retry</Button>
        </div>
      );
    default:
      return exhaustiveState(state);
  }
}

function SessionActions({ compact = false }: { readonly compact?: boolean }) {
  return (
    <div className={`${styles.actions} ${compact ? styles.compactActions : ""}`}>
      <Button asChild className={styles.findButton}>
        <Link href="/discover?returnTo=%2F"><Search aria-hidden />Find a session</Link>
      </Button>
      <Button asChild variant="outline" className={styles.hostButton}>
        <Link href="/sessions/create">Host a session{!compact && <ArrowRight aria-hidden />}</Link>
      </Button>
    </div>
  );
}

/** A quiet decorative ball keeps the empty diary visually distinct from a loading state. */
function EmptyBall() {
  return (
    <Image className={styles.emptyBall} src="/images/home-empty-ball.webp" width={128} height={78} alt="" sizes="128px" />
  );
}

const singaporeDate = new Intl.DateTimeFormat("en-SG", {
  timeZone: "Asia/Singapore", day: "numeric", month: "short", year: "numeric",
});
const singaporeTime = new Intl.DateTimeFormat("en-SG", {
  timeZone: "Asia/Singapore", hour: "numeric", minute: "2-digit",
});
const singaporeDateTime = new Intl.DateTimeFormat("en-SG", {
  timeZone: "Asia/Singapore", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
});

function BookingCard({ booking }: { readonly booking: HomeBooking }) {
  const start = new Date(booking.startAt);
  const end = new Date(booking.endAt);
  const dateParts = singaporeDate.formatToParts(start);
  const day = dateParts.find(({ type }) => type === "day")?.value;
  const month = dateParts.find(({ type }) => type === "month")?.value;
  const year = dateParts.find(({ type }) => type === "year")?.value;
  const sameDay = singaporeDate.format(start) === singaporeDate.format(end);

  return (
    <li className={styles.bookingCard}>
      <article className="flex min-h-[128px] items-stretch p-4 md:min-h-[154px] md:p-6" aria-label={`${booking.sport} booking at ${booking.venueName}`}>
        <time dateTime={booking.startAt} aria-label={singaporeDate.format(start)} className="flex w-[72px] shrink-0 flex-col items-center justify-center border-r pr-3 md:w-[88px] md:pr-5">
          <span className="text-[24px] font-bold leading-none md:text-[32px]">{day}</span>
          <span className="mt-1 text-[10px] font-semibold uppercase leading-none md:text-xs">{month}</span>
          <span className="mt-1.5 text-[10px] leading-none text-muted-foreground">{year}</span>
        </time>
        <div className="flex min-w-0 flex-1 flex-col justify-center py-1 pl-5 md:pl-6">
          <h3 className="break-words text-sm font-semibold leading-snug md:text-base">{booking.sport} Booking</h3>
          <p className="mt-2 break-words text-xs leading-relaxed text-muted-foreground md:text-sm">{booking.venueName}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground md:text-xs">
            <span className="sr-only">Singapore time: </span>
            <time dateTime={booking.startAt}>{singaporeTime.format(start)}</time> – <time dateTime={booking.endAt}>{sameDay ? singaporeTime.format(end) : singaporeDateTime.format(end)}</time> SGT
          </p>
        </div>
      </article>
    </li>
  );
}

function WeatherCard({ weather }: { readonly weather: WeatherState }) {
  const forecast = weather.status === "ready" ? weather.forecast.toLowerCase() : "";
  const WeatherIcon = /thunder/.test(forecast) ? CloudLightning : /rain|shower/.test(forecast) ? CloudRain : /fair|sunny/.test(forecast) ? Sun : CloudSun;
  const overview = (
      <span className={styles.forecastOverview}>
        <span>
          <span className={styles.weatherLocation}>Singapore</span>
          {weather.status === "ready" ? (
            <>
              <span className={styles.temperature}>
                <span className="sr-only">24-hour forecast temperature range: </span>{weather.lowCelsius}–{weather.highCelsius}°C
              </span>
              <span className={styles.forecast}>{weather.forecast}</span>
            </>
          ) : (
            <span className={styles.forecast}>Weather is unavailable right now.</span>
          )}
        </span>
        <WeatherIcon className={styles.weatherIcon} strokeWidth={1.35} aria-hidden />
      </span>
  );
  return (
    <div className={styles.weather}>
      <h2 className="sr-only">Singapore weather</h2>
      {weather.status === "ready" ? (
        <details className={styles.weatherDisclosure}>
          <summary title="Forecast details" aria-label={`Forecast details: Singapore, ${weather.lowCelsius}–${weather.highCelsius}°C, ${weather.forecast}`}>{overview}</summary>
          <div className={styles.forecastDetails}>
            <p className="font-medium text-foreground">Singapore · 24-hour forecast</p>
            <dl className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
              <div>
                <dt className="font-medium">Forecast period (SGT)</dt>
                <dd className="mt-0.5"><time dateTime={weather.validFrom}>{singaporeDateTime.format(new Date(weather.validFrom))}</time> – <time dateTime={weather.validTo}>{singaporeDateTime.format(new Date(weather.validTo))}</time></dd>
              </div>
              <div className="flex flex-wrap gap-x-1">
                <dt>Updated</dt>
                <dd><time dateTime={weather.updatedAt}>{singaporeDateTime.format(new Date(weather.updatedAt))}</time> SGT</dd>
              </div>
            </dl>
            <div className="mt-2 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
              <a href="https://data.gov.sg/datasets/d_ce2eb1e307bda31993c533285834ef2b/view" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 rounded-sm underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                Source: NEA / data.gov.sg <ArrowUpRight className="h-3 w-3" aria-hidden /><span className="sr-only"> (opens in a new tab)</span>
              </a>
              <a href="https://data.gov.sg/open-data-licence" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-sm underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                Singapore Open Data Licence<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>
          </div>
        </details>
      ) : overview}
    </div>
  );
}

function exhaustiveState(state: never): never {
  throw new Error(`Unsupported Home state: ${String(state)}`);
}
