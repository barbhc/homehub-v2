import { LegalPage, Section, P, Bullets, Processors } from "./LegalPage"
import { LEGAL } from "./legalConfig"

/**
 * Privacy Policy.
 *
 * Written against what the code ACTUALLY does, audited 2026-07-31 — not a
 * template. If you add a third-party call, an analytics event class, or a new
 * category of stored data, this page is part of that change: App Store Connect's
 * App Privacy answers have to match it, and a policy that drifts from the code
 * is worse than none.
 */
export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" effective={LEGAL.effective}>
      <P>
        Homehub keeps track of the appliances and equipment in your home, reads their manuals, and
        works out what maintenance they need. This page explains exactly what it stores, what leaves
        your device, and who else sees it.
      </P>

      <Section heading="Who is responsible for your data">
        <P>
          {LEGAL.controller} is responsible for the personal data described here. You can reach us
          at{" "}
          <a href={`mailto:${LEGAL.contactEmail}`} style={{ color: "var(--hh-teal)", fontWeight: 600 }}>
            {LEGAL.contactEmail}
          </a>
          .
        </P>
      </Section>

      <Section heading="What Homehub stores">
        <Bullets
          items={[
            <><b>Your account</b> — your email address and an account identifier. If you sign in with Apple and choose to hide your email, we only ever receive Apple's private relay address.</>,
            <><b>Your home</b> — a name you choose and a time zone. Homehub does <b>not</b> ask for or store your street address, and it does not collect your location.</>,
            <><b>Your items</b> — brand, model, serial number, purchase date, warranty details, category, room, tags, and any photos you add.</>,
            <><b>Manuals</b> — PDFs you upload or links you supply, plus the text extracted from them.</>,
            <><b>Your maintenance plan</b> — tasks, schedules, what you have marked done, and any corrections you make to how a task was categorized.</>,
            <><b>Questions you ask</b> — the questions you put to the in-app assistant and the answers it gives.</>,
            <><b>Notification token</b> — if you turn on reminders, a device token used solely to deliver them.</>,
            <><b>Usage and error data</b> — which screens you open and which core actions you take, plus diagnostic reports when something crashes.</>,
          ]}
        />
      </Section>

      <Section heading="What we do not do">
        <Bullets
          items={[
            <>We do not sell your personal data, and we do not share it with advertisers or data brokers.</>,
            <>We do not use your data to build advertising profiles or to track you across other apps and websites.</>,
            <>We do not collect your location, and we do not access your contacts, calendar, or health data.</>,
            <>We do not record your screen or your voice.</>,
          ]}
        />
      </Section>

      <Section heading="Where your data goes">
        <P>
          Homehub relies on a small number of outside services to work. Each one receives only what
          that specific feature needs. They process it on our behalf and are not permitted to use it
          for their own purposes.
        </P>
        <Processors
          rows={[
            {
              name: "Google Firebase",
              data: "Your account, home, items, manuals, tasks, photos, and notification token.",
              why: "Sign-in, the database your home lives in, file storage, and reminder delivery.",
            },
            {
              name: "Anthropic",
              data: "Text extracted from manuals you add, and questions you ask the assistant.",
              why: "Reading a manual into a maintenance plan, and answering questions about your items.",
            },
            {
              name: "Google Cloud Vision",
              data: "Photos you take of an appliance nameplate or a receipt.",
              why: "Reading the text off the label so brand and model fill in automatically.",
            },
            {
              name: "Brave Search",
              data: "Brand and model names, and the wording of a question when you ask for a web search.",
              why: "Finding the right owner's manual, and answering questions your manuals do not cover.",
            },
            {
              name: "Icecat",
              data: "Brand, model, or barcode you enter.",
              why: "Identifying a product so its details fill in automatically.",
            },
            {
              name: "U.S. Consumer Product Safety Commission",
              data: "Brand and model names.",
              why: "Checking whether an item you own has been recalled.",
            },
            {
              name: "PostHog",
              data: "Product usage events and your account identifier.",
              why: "Understanding which parts of the app work and which are confusing. Session recording is off.",
            },
            {
              name: "Sentry",
              data: "Error reports, including the screen you were on when something failed.",
              why: "Finding and fixing crashes.",
            },
          ]}
        />
        <P>
          These services operate in the United States. If you use Homehub from elsewhere, your data
          is transferred and processed there.
        </P>
      </Section>

      <Section heading="Photos and manuals">
        <P>
          Photos you attach to an item are stored with that item and are not used for anything else.
          A photo you take specifically to scan a label is additionally sent to Google Cloud Vision so
          the text can be read back; it is used for that scan and to fill in the item's details.
          Manuals you add are stored and their text is sent to Anthropic to produce the maintenance
          tasks for that item.
        </P>
      </Section>

      <Section heading="Sharing a home with other people">
        <P>
          If you invite someone to your home, they can see and edit the items, manuals, and tasks in
          it. Invite only people you want to have that access. You can remove someone at any time,
          which ends their access going forward.
        </P>
      </Section>

      <Section heading="How long we keep it">
        <P>
          Your data is kept for as long as your account exists. When you delete an item, a home, or
          your account, we remove it from the live app and delete it from our systems within{" "}
          {LEGAL.deletionWindow}. Backups are cycled out within {LEGAL.backupWindow}. Error and usage
          records are kept for {LEGAL.telemetryRetention}.
        </P>
      </Section>

      <Section heading="Your choices">
        <Bullets
          items={[
            <><b>See and correct</b> — every item, task, and detail Homehub holds about your home is visible in the app and editable there.</>,
            <><b>Export</b> — email us and we will send you a copy of your data.</>,
            <><b>Delete</b> — you can delete individual items in the app. To delete your whole account and everything in it, email us and we will action it within {LEGAL.deletionWindow}.</>,
            <><b>Reminders</b> — turn notifications off in your device settings at any time.</>,
          ]}
        />
        <P>
          Depending on where you live, you may also have the right to object to or restrict how we
          use your data, or to lodge a complaint with your data protection authority. Write to us and
          we will help.
        </P>
      </Section>

      <Section heading="Security">
        <P>
          Your data is transmitted over encrypted connections and stored by Google Firebase with
          access rules that limit each home's data to its own members. No system is perfect, and we
          do not claim otherwise; if we ever become aware of a breach affecting your data, we will
          tell you.
        </P>
      </Section>

      <Section heading="Children">
        <P>
          Homehub is not intended for children under 13, and we do not knowingly collect their data.
          If you believe a child has given us personal data, contact us and we will delete it.
        </P>
      </Section>

      <Section heading="Changes">
        <P>
          If this policy changes in a way that materially affects you, we will let you know in the
          app before the change takes effect. The date at the top always reflects the current
          version.
        </P>
      </Section>

      <Section heading="Contact">
        <P>
          Questions, requests, or complaints:{" "}
          <a href={`mailto:${LEGAL.contactEmail}`} style={{ color: "var(--hh-teal)", fontWeight: 600 }}>
            {LEGAL.contactEmail}
          </a>
          .
        </P>
      </Section>
    </LegalPage>
  )
}
