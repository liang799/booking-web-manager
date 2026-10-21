"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, Check, ChevronDown, Clock3, Info, Minus, Plus, Save } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useStore } from "zustand";
import { SPORTS } from "@/app/(auth)/schemas";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MAX_SESSION_SLOTS, MIN_SESSION_SLOTS } from "@/domain/sessions/capacity";
import { sportImage } from "@/lib/sessions/sport-image";
import type { createSessionStore, PendingStorage } from "./create-session-store";
import { bookingDates, decimalCents, draftPricing, durationMinutes, parseSgdCents, singaporeTimestamp, validateDates, type FieldErrors, type SessionDraft } from "./model";
import { saveDraft } from "./saved-session-draft";
import type { SearchVenues } from "./transport";
import { VenuePicker } from "./venue-picker";
import styles from "./desktop-session-wizard.module.css";

const steps = [
  { name: "Schedule", detail: "Date & time", title: "When do you want to play?", description: "Choose a date, start time and duration. All times are in Singapore (SGT).", next: "Choose your sport, venue and booking cost." },
  { name: "Venue details", detail: "Sport & location", title: "What are you playing?", description: "Tell us what you're playing and where you've booked.", next: "Set visibility, player slots and reliability preferences." },
  { name: "Session settings", detail: "Players & access", title: "Make it your kind of game.", description: "Choose who can join and when the session can go ahead.", next: "Review the suggested price and choose what players pay." },
  { name: "Pricing", detail: "Set your price", title: "Set your price.", description: "Review the suggested price, then choose what each player pays.", next: "Review your settings before creating the session." },
] as const;
const dateFormat = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", weekday: "short", day: "numeric", month: "short", year: "numeric" });
const longDateFormat = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", hour: "numeric", minute: "2-digit", hour12: true });
const timeLabel = (timestamp: string) => timeFormat.format(new Date(timestamp)).toUpperCase();
function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return [hours ? `${hours} ${hours === 1 ? "hour" : "hours"}` : "", rest ? `${rest} min` : ""].filter(Boolean).join(" ");
}

interface Props {
  readonly store: ReturnType<typeof createSessionStore>;
  readonly search: SearchVenues;
  readonly userId: string;
  readonly storage?: PendingStorage;
  readonly venueStep: boolean;
  readonly onVenueStepChange: (venue: boolean) => void;
  readonly duration: string;
  readonly onDurationChange: (duration: string) => void;
  readonly onNext: () => void;
  readonly onSubmit: () => void;
  readonly formRef: RefObject<HTMLDivElement | null>;
}

/** Desktop presentation shares the mobile workflow; only booked details are split into two screens. */
export function DesktopSessionWizard({ store, search, userId, storage, venueStep, onVenueStepChange, duration, onDurationChange, onNext, onSubmit, formRef }: Props) {
  const { draft, step, workflow } = useStore(store);
  const { change, back, restartAfterRecovery } = store.getState();
  const [scheduleError, setScheduleError] = useState<string>();
  const [saveMessage, setSaveMessage] = useState<{ text: string; error?: boolean; draft?: SessionDraft }>();
  const stage = step === 1 ? venueStep ? 2 : 1 : step + 1;
  const current = steps[stage - 1]!;
  const errors: FieldErrors = workflow.status === "editing" ? workflow.errors : {};
  const locked = workflow.status !== "editing";
  const submitting = workflow.status === "submitting";
  const completed = workflow.status === "completed";
  const recoveryRequired = workflow.status === "recoveryRequired";
  const failure = "failure" in workflow ? workflow.failure : null;
  const pending = "pending" in workflow ? workflow.pending : null;
  const range = draftPricing(draft);
  const price = parseSgdCents(draft.price);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const failureRef = useCallback((node: HTMLDivElement | null) => { node?.focus(); }, []);
  useEffect(() => {
    const currentWorkflow = store.getState().workflow;
    if (!("failure" in currentWorkflow && currentWorkflow.failure)) headingRef.current?.focus();
  }, [stage, store]);
  useEffect(() => {
    if (workflow.status !== "editing") return;
    const fields = stage === 1 && workflow.errors.dateTime ? ["dateTime"] : Object.keys(workflow.errors);
    for (const field of fields) {
      const control = formRef.current?.querySelector<HTMLElement>(`[id="${field === "dateTime" ? "startDate" : field}"]`);
      if (control) { control.focus(); break; }
    }
  }, [workflow, formRef, stage]);

  function next() {
    if (stage === 1) {
      const found = validateDates(draft);
      setScheduleError(found.dateTime);
      if (found.dateTime) formRef.current?.querySelector<HTMLElement>("#startDate")?.focus();
      else onVenueStepChange(true);
    } else onNext();
  }
  function previous() {
    if (stage === 2) onVenueStepChange(false);
    else { onVenueStepChange(true); back(); }
  }
  function save() {
    try {
      saveDraft(storage ?? window.sessionStorage, userId, draft, stage as 1 | 2 | 3 | 4, duration);
      setSaveMessage({ text: "Draft saved in this tab. You can come back to it later.", draft });
    } catch { setSaveMessage({ text: "Couldn't save your draft. Enable session storage or free up space, then try again.", error: true }); }
  }

  return <div className={styles.page}>
    <nav aria-label="Breadcrumb" className={styles.breadcrumb}><Link href="/sessions">My sessions</Link><span aria-hidden="true">/</span><span aria-current="page">Create booking</span></nav>
    <section aria-label="Create a session" className={styles.panel}>
      <header className={styles.header}>
        <div className={styles.titleRow}><div><h1>Create booking</h1><p>Set up your next game in four simple steps.</p></div>
          <Button type="button" variant="ghost" onClick={save} disabled={locked} className={styles.save}><Save aria-hidden="true" />Save draft</Button>
        </div>
        <ol aria-label="Creation progress" className={styles.progress}>{steps.map((item, index) => <li key={item.name} aria-current={stage === index + 1 ? "step" : undefined} data-complete={stage > index + 1}>
          <span className={styles.stepNumber}>{stage > index + 1 ? <Check aria-hidden="true" size={15} /> : index + 1}</span>
          <span className={styles.stepText}><span>{item.name}</span><small>{item.detail}</small></span>
          {index < 3 && <span className={styles.connector} aria-hidden="true" />}
        </li>)}</ol>
        {saveMessage && <p role={saveMessage.error ? "alert" : "status"} className={styles.saveMessage}>{saveMessage.draft && saveMessage.draft !== draft ? "You have unsaved changes." : saveMessage.text}</p>}
      </header>
      <div className={styles.columns}>
        <div ref={formRef} role="region" aria-label="Session form" className={styles.form}>
          <p className={styles.eyebrow}>0{stage} / {current.name}</p>
          <h2 ref={headingRef} tabIndex={-1} className={styles.heading}>{current.title}</h2>
          <p className={styles.description}>{current.description}</p>
          <div className={styles.fields}>
            {stage === 1 && <ScheduleFields draft={draft} duration={duration} onDurationChange={onDurationChange} disabled={locked} error={scheduleError ?? errors.dateTime} onChange={(patch) => { setScheduleError(undefined); change(patch); }} />}
            {stage === 2 && <>
              <div className={styles.field}><label htmlFor="sport">Sport</label><Select value={draft.sport} disabled={locked} onValueChange={(sport) => change({ sport })}>
                <SelectTrigger id="sport" aria-invalid={!!errors.sport}><SelectValue /></SelectTrigger><SelectContent>{SPORTS.map((sport) => <SelectItem key={sport} value={sport}>{sport}</SelectItem>)}</SelectContent>
              </Select>{errors.sport && <p role="alert" className={styles.error}>{errors.sport}</p>}</div>
              <div className={styles.venue}><VenuePicker draft={draft} errors={errors} disabled={locked} onChange={change} search={search} /></div>
              <div className={styles.cost}><CurrencyField id="cost" label="Booked venue cost (SGD)" value={draft.cost} disabled={locked} error={errors.cost} help="The amount you paid to reserve the venue." onChange={(cost) => change({ cost })} /></div>
            </>}
            {stage === 3 && <>
              <div className={styles.field}><label htmlFor="visibility">Room visibility</label><Select value={draft.visibility} disabled={locked} onValueChange={(visibility: "PRIVATE" | "PUBLIC") => change({ visibility })}>
                <SelectTrigger id="visibility"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PRIVATE">Private</SelectItem><SelectItem value="PUBLIC">Public</SelectItem></SelectContent>
              </Select><p className={styles.help}>{draft.visibility === "PRIVATE" ? "Private sessions are shared by invitation." : "People can find this session in Discover."}</p></div>
              <div className={styles.pair}>
                <CountField id="totalSlots" label="Number of slots" value={draft.totalSlots} min={MIN_SESSION_SLOTS} max={MAX_SESSION_SLOTS} disabled={locked} help="Total places available." error={errors.totalSlots} onChange={(totalSlots) => change({ totalSlots })} />
                <CountField id="minimumHeadcount" label="Minimum viable headcount" value={draft.minimumHeadcount} min={2} max={draft.totalSlots} disabled={locked} help="The minimum needed to play." error={errors.minimumHeadcount} onChange={(minimumHeadcount) => change({ minimumHeadcount })} />
              </div>
              <div className={`${styles.field} ${styles.shortField}`}><label htmlFor="reliability">Minimum reliability score</label><Select value={draft.reliability} disabled={locked} onValueChange={(reliability) => change({ reliability })}>
                <SelectTrigger id="reliability" aria-invalid={!!errors.reliability}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No minimum</SelectItem>{[60, 70, 80, 90, 100].map((score) => <SelectItem key={score} value={String(score)}>{(score / 20).toFixed(1)} / 5.0</SelectItem>)}</SelectContent>
              </Select>{errors.reliability && <p role="alert" className={styles.error}>{errors.reliability}</p>}</div>
            </>}
            {stage === 4 && <>
              <div className={styles.suggestion}><p className={styles.eyebrow}>Suggested price per slot</p><p className={styles.suggestedPrice}><Money cents={range?.suggestedCents ?? 0} /></p><p className={styles.help}>Use this as a starting point. You're in control of the final price.</p></div>
              <CurrencyField id="price" label="Price per slot (SGD)" value={draft.price} disabled={locked} error={errors.price} onChange={(value) => change({ price: value })} />
              {range && <div className={styles.slider}><input aria-label="Price per slot slider" aria-describedby="price-range" type="range" min={range.minimumCents} max={range.maximumCents} step={1} value={Math.max(range.minimumCents, Math.min(range.maximumCents, price ?? range.suggestedCents))} disabled={locked}
                onChange={(event) => change({ price: decimalCents(Number(event.target.value)) })}
                onKeyDown={(event) => {
                  const current = price ?? range.suggestedCents;
                  const target = event.key === "Home" ? range.minimumCents : event.key === "End" ? range.maximumCents
                    : ["ArrowRight", "ArrowUp"].includes(event.key) ? current + 1 : ["ArrowLeft", "ArrowDown"].includes(event.key) ? current - 1 : undefined;
                  if (target !== undefined) { event.preventDefault(); change({ price: decimalCents(Math.max(range.minimumCents, Math.min(range.maximumCents, target))) }); }
                }} />
                <p id="price-range"><Money cents={range.minimumCents} /><Money cents={range.maximumCents} /></p></div>}
              <div><div className={styles.revenue}><p>Estimated revenue if all {draft.totalSlots} slots are filled</p><output aria-live="polite"><Money cents={range && price !== undefined && price >= range.minimumCents && price <= range.maximumCents ? price * draft.totalSlots : 0} /></output></div><p className={styles.help}>Estimate only. Actual earnings depend on paid bookings.</p></div>
            </>}
            {failure && <div key={`${failure.code}:${failure.message}`} ref={failureRef} tabIndex={-1} className={styles.failure}><ErrorMessage>{failure.message}</ErrorMessage>
              {recoveryRequired && <><Button asChild variant="link"><Link href="/sessions" target="_blank" rel="noopener noreferrer">Check hosted sessions (new tab)</Link></Button><p className={styles.help}>Starting again keeps a backup of the saved details. Only continue if you have confirmed the session was not created.</p><Button type="button" variant="outline" onClick={restartAfterRecovery}>I checked my sessions; start again</Button></>}
              {pending && <p className={styles.help}>Your submitted details are saved. Editing is paused until this submission is resolved.</p>}
              {failure.code === "UNAUTHENTICATED" && <Button asChild variant="link"><Link href="/login?next=%2Fsessions%2Fcreate">Sign in again</Link></Button>}
            </div>}
          </div>
        </div>
        <SessionSummary draft={draft} stage={stage} />
      </div>
      <footer className={styles.footer}>
        {stage === 1 ? <Button asChild variant="outline"><Link href="/sessions">Cancel</Link></Button> : <Button type="button" variant="outline" disabled={locked} onClick={previous}>Back</Button>}
        <Button type="button" disabled={submitting || completed || recoveryRequired} onClick={stage === 4 ? onSubmit : next}>{stage === 4 ? submitting ? "Creating…" : pending ? "Retry submission" : "Create session" : "Continue"}<ArrowRight aria-hidden="true" /></Button>
      </footer>
    </section>
  </div>;
}

function ScheduleFields({ draft, duration, onDurationChange, disabled, error, onChange }: { readonly draft: SessionDraft; readonly duration: string; readonly onDurationChange: (duration: string) => void; readonly disabled: boolean; readonly error?: string; readonly onChange: (patch: Partial<SessionDraft>) => void }) {
  const commonDurations = [30, 60, 90, 120, 180];
  const [custom, setCustom] = useState(!commonDurations.includes(Number(duration)));
  const start = singaporeTimestamp(draft.startDate, draft.startTime);
  const date = singaporeTimestamp(draft.startDate, "00:00");
  const end = singaporeTimestamp(draft.endDate, draft.endTime);
  function update(patch: Partial<SessionDraft>, minutes = duration) {
    const dates = bookingDates(patch.startDate ?? draft.startDate, patch.startTime ?? draft.startTime, minutes);
    onChange({ ...patch, ...(dates ?? { endDate: "", endTime: "" }) });
  }
  return <>
    <div className={styles.field}><label htmlFor="startDate">Date</label><div className={styles.dateControl}><CalendarDays aria-hidden="true" /><span>{date ? longDateFormat.format(new Date(date)) : "Choose a date"}</span><ChevronDown aria-hidden="true" className={styles.dateChevron} />
      <Input id="startDate" type="date" value={draft.startDate} disabled={disabled} aria-invalid={!!error} aria-describedby={error ? "schedule-error" : undefined} onChange={(event) => update({ startDate: event.target.value })} />
    </div></div>
    <div className={styles.pair}><div className={styles.field}><label htmlFor="startTime">Start time</label><div className={styles.iconControl}><Clock3 aria-hidden="true" /><Input id="startTime" type="time" value={draft.startTime} disabled={disabled} aria-invalid={!!error} aria-describedby={error ? "schedule-error" : undefined} onChange={(event) => update({ startTime: event.target.value })} /></div></div>
      <div className={styles.field}><label htmlFor="duration">Duration</label><div className={styles.iconControl}><Clock3 aria-hidden="true" /><Select value={custom ? "custom" : duration} disabled={disabled} onValueChange={(value) => {
        setCustom(value === "custom");
        if (value !== "custom") { onDurationChange(value); update({}, value); }
      }}><SelectTrigger id="duration" aria-invalid={!!error} aria-describedby={error ? "schedule-error" : undefined}><SelectValue /></SelectTrigger><SelectContent>{commonDurations.map((minutes) => <SelectItem value={String(minutes)} key={minutes}>{durationLabel(minutes)}</SelectItem>)}<SelectItem value="custom">Custom duration</SelectItem></SelectContent></Select></div>
        {custom && <><label htmlFor="custom-duration">Duration (minutes)</label><Input id="custom-duration" type="number" min={1} step={1} value={duration} disabled={disabled} aria-invalid={!!error} aria-describedby={error ? "schedule-error" : undefined} onChange={(event) => { onDurationChange(event.target.value); update({}, event.target.value); }} /></>}
      </div>
    </div>
    {error && <p id="schedule-error" role="alert" className={styles.error}>{error}</p>}
    <p className={styles.finish} aria-live="polite"><Clock3 aria-hidden="true" />{start && end ? <>Your session will end at {timeLabel(end)}{draft.endDate !== draft.startDate ? ` on ${dateFormat.format(new Date(end))}` : ""}.</> : "Your finish time will appear once you've set your schedule."}</p>
  </>;
}

function CurrencyField({ id, label, value, disabled, error, help, onChange }: { readonly id: string; readonly label: string; readonly value: string; readonly disabled: boolean; readonly error?: string; readonly help?: string; readonly onChange: (value: string) => void }) {
  return <div className={styles.field}><label htmlFor={id}>{label}</label><div className={`${styles.currency} ${styles.shortField}`}><span aria-hidden="true">S$</span><Input id={id} inputMode="decimal" placeholder="0.00" value={value} disabled={disabled} aria-invalid={!!error} aria-describedby={`${id}-error${help ? ` ${id}-help` : ""}`} onChange={(event) => onChange(event.target.value)} /></div>
    {help && <p id={`${id}-help`} className={styles.help}>{help}</p>}<p id={`${id}-error`} role={error ? "alert" : undefined} className={styles.error}>{error}</p></div>;
}

function CountField({ id, label, value, min, max, disabled, help, error, onChange }: { readonly id: string; readonly label: string; readonly value: number; readonly min: number; readonly max: number; readonly disabled: boolean; readonly help: string; readonly error?: string; readonly onChange: (value: number) => void }) {
  return <div className={styles.field}><span id={`${id}-label`} className={styles.label}>{label}</span><div id={id} role="group" aria-labelledby={`${id}-label`} tabIndex={-1} className={styles.counter}>
    <Button type="button" variant="secondary" size="icon" aria-label={`Decrease ${label}`} disabled={disabled || value <= min} onClick={() => onChange(value - 1)}><Minus aria-hidden="true" /></Button><output aria-live="polite">{value}</output><Button type="button" variant="secondary" size="icon" aria-label={`Increase ${label}`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}><Plus aria-hidden="true" /></Button>
  </div><p className={styles.help}>{help}</p>{error && <p role="alert" className={styles.error}>{error}</p>}</div>;
}

function SessionSummary({ draft, stage }: { readonly draft: SessionDraft; readonly stage: number }) {
  const start = singaporeTimestamp(draft.startDate, draft.startTime);
  const end = singaporeTimestamp(draft.endDate, draft.endTime);
  const duration = durationMinutes(draft);
  const cost = parseSgdCents(draft.cost);
  const range = draftPricing(draft);
  const price = parseSgdCents(draft.price);
  const validPrice = range && price !== undefined && price >= range.minimumCents && price <= range.maximumCents;
  const period = draft.startTime < "12:00" ? "morning" : draft.startTime < "17:00" ? "afternoon" : "evening";
  const weekday = start ? new Intl.DateTimeFormat("en-SG", { weekday: "long", timeZone: "Asia/Singapore" }).format(new Date(start)) : undefined;
  const title = stage === 1 ? weekday ? `${weekday} ${period}` : "Your next game starts here" : draft.venueName.trim() || "Your venue";
  const subtitle = stage === 1 ? "Your schedule is taking shape." : stage === 2 ? `${draft.sport} · venue details` : stage === 3 ? `${draft.totalSlots} slots · ${draft.visibility.toLowerCase()} session` : `${draft.sport} · ${draft.totalSlots} available slots`;
  const rows = [
    { label: "Date", value: start ? dateFormat.format(new Date(start)) : "Choose a date" },
    { label: "Start time", value: start ? timeLabel(start) : "Choose a time" },
    { label: "Duration", value: duration ? durationLabel(duration) : "—" },
    { label: "Finishes", value: end ? `${timeLabel(end)} (SGT)${draft.endDate !== draft.startDate ? ` · ${dateFormat.format(new Date(end))}` : ""}` : "—" },
    ...(stage >= 2 ? [{ label: "Sport", value: draft.sport }, { label: "Venue cost", value: cost === undefined ? "—" : <Money cents={cost} /> }] : []),
    ...(stage >= 3 ? [{ label: "Visibility", value: draft.visibility === "PRIVATE" ? "Private" : "Public" }, { label: "Players", value: `${draft.totalSlots} slots · minimum ${draft.minimumHeadcount}` }] : []),
    ...(stage === 4 ? [{ label: "Price per slot", value: validPrice ? <Money cents={price} /> : "—" }, { label: "Potential revenue", value: validPrice ? <Money cents={price * draft.totalSlots} /> : "—" }] : []),
  ];
  return <aside className={styles.summary} aria-label="Your session at a glance">
    <div className={styles.photo}><Image src={draft.sport === "Tennis" ? "/images/session-court.webp" : sportImage(draft.sport)} alt="" fill priority sizes="(min-width: 1280px) 30vw, (min-width: 1100px) 32vw, 1px" className="object-cover" /></div>
    <p className={styles.eyebrow}>Your session at a glance</p><h2>{title}</h2><p className={styles.summarySubtitle}>{subtitle}</p>
    <dl>{rows.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <div className={styles.upNext}><Info aria-hidden="true" /><div><p>{stage === 4 ? "Ready to create" : `Up next: ${steps[stage]!.name}`}</p><span>{steps[stage - 1]!.next}</span></div></div>
  </aside>;
}
