"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarDays, ChevronDown, Clock3, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, type CSSProperties, type RefObject } from "react";
import { useStore } from "zustand";
import { SPORTS } from "@/app/(auth)/schemas";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MAX_SESSION_SLOTS, MIN_SESSION_SLOTS } from "@/domain/sessions/capacity";
import { sportImage } from "@/lib/sessions/sport-image";
import { creationDuration, creationScreen, hasUnsavedDraftChanges, type createSessionStore, type DurationInput, type PresetDuration } from "./create-session-store";
import { decimalCents, draftPricing, parseSgdCents, singaporeTimestamp, type FieldErrors, type SessionDraft } from "./model";
import type { SearchVenues } from "./transport";
import { VenuePicker } from "./venue-picker";
import styles from "./desktop-session-wizard.module.css";

const steps = [
  { name: "Schedule", title: "When do you want to play?", description: "Choose a date, start time and duration. All times are in Singapore (SGT)." },
  { name: "Venue", title: "What are you playing?", description: "Tell us what you're playing and where you've booked." },
  { name: "Settings", title: "Make it your kind of game.", description: "Choose who can join and when the session can go ahead." },
  { name: "Pricing", title: "Set your price.", description: "Choose what each player pays." },
] as const;
const dateFormat = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", weekday: "short", day: "numeric", month: "short", year: "numeric" });
const longDateFormat = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", hour: "numeric", minute: "2-digit", hour12: true });
const timeLabel = (timestamp: string) => timeFormat.format(new Date(timestamp)).toUpperCase();
const compactTimeLabel = (timestamp: string) => timeFormat.format(new Date(timestamp)).toLowerCase().replace(":00", "").replace(/\s/g, "");
function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return [hours ? `${hours} ${hours === 1 ? "hour" : "hours"}` : "", rest ? `${rest} min` : ""].filter(Boolean).join(" ");
}

interface Props {
  readonly store: ReturnType<typeof createSessionStore>;
  readonly search: SearchVenues;
  readonly onNext: () => void;
  readonly onSubmit: () => void;
  readonly formRef: RefObject<HTMLDivElement | null>;
}

/** Desktop presentation shares the mobile workflow; only booked details are split into two screens. */
export function DesktopSessionWizard({ store, search, onNext, onSubmit, formRef }: Props) {
  const state = useStore(store);
  const { draft, workflow, saveResult } = state;
  const { change, changeSchedule, chooseDuration, changeDuration, back, saveDraft, restartAfterRecovery } = store.getState();
  const screen = creationScreen(state);
  const duration = creationDuration(state);
  const stage = screen === "schedule" ? 1 : screen === "venue" ? 2 : screen === "settings" ? 3 : 4;
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

  return <div className={styles.page}>
    <section aria-label="Create a session" className={styles.panel}>
      <header>
        <div className={styles.titleRow}><h1>Create booking</h1>
          <Button type="button" variant="ghost" onClick={saveDraft} disabled={locked} className={styles.save}>Save draft</Button>
        </div>
        <ol aria-label="Creation progress" className={styles.progress} style={{ "--active-step": stage - 1 } as CSSProperties}>{steps.map((item, index) => <li key={item.name} aria-current={stage === index + 1 ? "step" : undefined} data-complete={stage > index + 1}>
          <span className={styles.stepText}><span className={styles.stepNumber} aria-hidden="true">0{index + 1}</span>{item.name}</span>
        </li>)}</ol>
        {workflow.status === "editing" && saveResult.status !== "idle" && <p role={saveResult.status === "error" ? "alert" : "status"} className={styles.saveMessage}>{saveResult.status === "error" ? saveResult.message : hasUnsavedDraftChanges(state) ? "You have unsaved changes." : "Draft saved in this tab. You can come back to it later."}</p>}
      </header>
      <div className={styles.columns}>
        <div key={stage} ref={formRef} role="region" aria-label="Session form" className={styles.form}>
          <p className={styles.eyebrow}>0{stage} / {current.name}</p>
          <h2 ref={headingRef} tabIndex={-1} className={styles.heading}>{current.title}</h2>
          <p className={styles.description}>{current.description}</p>
          <div className={styles.fields}>
            {stage === 1 && <ScheduleFields draft={draft} duration={duration} onChooseDuration={chooseDuration} onDurationChange={changeDuration} disabled={locked} error={errors.dateTime} onChange={changeSchedule} />}
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
              <CountField id="totalSlots" label="Number of slots" value={draft.totalSlots} min={MIN_SESSION_SLOTS} max={MAX_SESSION_SLOTS} disabled={locked} help="Includes you as the booker." error={errors.totalSlots} onChange={(totalSlots) => change({ totalSlots })} />
              <div className={`${styles.field} ${styles.shortField}`}><label htmlFor="reliability">Minimum reliability score</label><Select value={draft.reliability} disabled={locked} onValueChange={(reliability) => change({ reliability })}>
                <SelectTrigger id="reliability" aria-invalid={!!errors.reliability}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No minimum</SelectItem>{[60, 70, 80, 90, 100].map((score) => <SelectItem key={score} value={String(score)}>{(score / 20).toFixed(1)} / 5.0</SelectItem>)}</SelectContent>
              </Select>{errors.reliability && <p role="alert" className={styles.error}>{errors.reliability}</p>}</div>
            </>}
            {stage === 4 && <>
              <div className={styles.priceField}>
                <CurrencyField id="price" label="Price per slot (SGD)" value={draft.price} disabled={locked} error={errors.price} onChange={(value) => change({ price: value })} />
                {range && <p className={styles.help}>Suggested <Money cents={range.suggestedCents} /> · based on your venue cost and {draft.totalSlots} slots.</p>}
              </div>
              {range && <div className={styles.slider}><input aria-label="Price per slot slider" aria-describedby="price-range" type="range" min={range.minimumCents} max={range.maximumCents} step={1} value={Math.max(range.minimumCents, Math.min(range.maximumCents, price ?? range.suggestedCents))} disabled={locked}
                onChange={(event) => change({ price: decimalCents(Number(event.target.value)) })}
                onKeyDown={(event) => {
                  const current = price ?? range.suggestedCents;
                  const target = event.key === "Home" ? range.minimumCents : event.key === "End" ? range.maximumCents
                    : ["ArrowRight", "ArrowUp"].includes(event.key) ? current + 1 : ["ArrowLeft", "ArrowDown"].includes(event.key) ? current - 1 : undefined;
                  if (target !== undefined) { event.preventDefault(); change({ price: decimalCents(Math.max(range.minimumCents, Math.min(range.maximumCents, target))) }); }
                }} />
                <p id="price-range"><Money cents={range.minimumCents} /><Money cents={range.maximumCents} /></p></div>}
              <div className={styles.revenue}><p>Estimated collected revenue at full capacity ({draft.totalSlots} slots)</p><output aria-live="polite"><Money cents={range && price !== undefined && price >= range.minimumCents && price <= range.maximumCents ? price * (draft.totalSlots - 1) : 0} /></output><p className={styles.help}>Excludes your place, which is covered by your venue payment.</p></div>
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
        {stage === 1 ? <Button asChild variant="ghost"><Link href="/sessions"><ArrowLeft aria-hidden="true" />Cancel</Link></Button> : <Button type="button" variant="ghost" disabled={locked} onClick={() => back("desktop")}><ArrowLeft aria-hidden="true" />Back</Button>}
        <Button type="button" disabled={submitting || completed || recoveryRequired} onClick={stage === 4 ? onSubmit : onNext}>{stage === 4 ? submitting ? "Creating…" : pending ? "Retry submission" : "Create session" : "Continue"}<ArrowRight aria-hidden="true" /></Button>
      </footer>
    </section>
  </div>;
}

function ScheduleFields({ draft, duration, onChooseDuration, onDurationChange, disabled, error, onChange }: {
  readonly draft: SessionDraft; readonly duration: DurationInput;
  readonly onChooseDuration: (duration: PresetDuration | "custom") => void; readonly onDurationChange: (duration: string) => void;
  readonly disabled: boolean; readonly error?: string; readonly onChange: (patch: Partial<Pick<SessionDraft, "startDate" | "startTime">>) => void;
}) {
  const commonDurations = [30, 60, 90, 120, 180];
  const start = singaporeTimestamp(draft.startDate, draft.startTime);
  const date = singaporeTimestamp(draft.startDate, "00:00");
  const end = singaporeTimestamp(draft.endDate, draft.endTime);
  return <>
    <div className={styles.field}><label htmlFor="startDate">Date</label><div className={styles.dateControl}><CalendarDays aria-hidden="true" /><span>{date ? longDateFormat.format(new Date(date)) : "Choose a date"}</span><ChevronDown aria-hidden="true" className={styles.dateChevron} />
      <Input id="startDate" type="date" value={draft.startDate} disabled={disabled} aria-invalid={!!error} aria-describedby={error ? "schedule-error" : undefined} onChange={(event) => onChange({ startDate: event.target.value })} />
    </div></div>
    <div className={styles.pair}><div className={styles.field}><label htmlFor="startTime">Start time</label><div className={styles.iconControl}><Clock3 aria-hidden="true" /><Input id="startTime" type="time" value={draft.startTime} disabled={disabled} aria-invalid={!!error} aria-describedby={error ? "schedule-error" : undefined} onChange={(event) => onChange({ startTime: event.target.value })} /></div></div>
      <div className={styles.field}><label htmlFor="duration">Duration</label><div className={styles.iconControl}><Clock3 aria-hidden="true" /><Select value={duration.mode === "custom" ? "custom" : duration.value} disabled={disabled} onValueChange={onChooseDuration}><SelectTrigger id="duration" aria-invalid={!!error} aria-describedby={error ? "schedule-error" : undefined}><SelectValue /></SelectTrigger><SelectContent>{commonDurations.map((minutes) => <SelectItem value={String(minutes)} key={minutes}>{durationLabel(minutes)}</SelectItem>)}<SelectItem value="custom">Custom duration</SelectItem></SelectContent></Select></div>
        {duration.mode === "custom" && <><label htmlFor="custom-duration">Duration (minutes)</label><Input id="custom-duration" type="number" min={1} step={1} value={duration.value} disabled={disabled} aria-invalid={!!error} aria-describedby={error ? "schedule-error" : undefined} onChange={(event) => onDurationChange(event.target.value)} /></>}
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
  const period = draft.startTime < "12:00" ? "morning" : draft.startTime < "17:00" ? "afternoon" : "evening";
  const weekday = start ? new Intl.DateTimeFormat("en-SG", { weekday: "long", timeZone: "Asia/Singapore" }).format(new Date(start)) : undefined;
  const title = stage === 1 ? weekday ? `${weekday} ${period}` : "Your next game starts here" : draft.venueName.trim() || "Your venue";
  return <aside className={styles.summary} aria-label="Your session at a glance">
    <div key={draft.sport} className={styles.photo}><Image src={draft.sport === "Tennis" ? "/images/session-court.webp" : sportImage(draft.sport)} alt="" fill priority sizes="(min-width: 1600px) 540px, (min-width: 1100px) 40vw, (min-width: 768px) 65vw, 1px" className="object-cover" /></div>
    <p className={styles.eyebrow}>{draft.sport} / {draft.visibility === "PRIVATE" ? "Private session" : "Public session"}</p>
    <h2>{title}</h2>
    <div className={styles.summaryDetails}>
      <p>{start ? dateFormat.format(new Date(start)) : "Choose a date"}{start && end && <> · {compactTimeLabel(start)} – {compactTimeLabel(end)} SGT</>}</p>
      {start && end && draft.endDate !== draft.startDate && <p>Ends {dateFormat.format(new Date(end))}</p>}
      {stage >= 3 && <p>{draft.totalSlots} {draft.totalSlots === 1 ? "participant" : "participants"}, including you</p>}
      {stage === 2 && draft.selectedVenue && <p>{draft.selectedVenue.address}</p>}
    </div>
  </aside>;
}
