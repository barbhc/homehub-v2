import { Link } from "react-router-dom"
import { LegalPage, Section, P, Bullets } from "./LegalPage"
import { LEGAL } from "./legalConfig"

/**
 * Terms of Service.
 *
 * The section that matters most here is "Maintenance advice is a suggestion":
 * Homehub reads manuals with an AI model and proposes work on gas, electrical
 * and water equipment. That has to be stated plainly rather than buried, and it
 * matches the product principle the app is built on — Homehub proposes, the
 * homeowner decides.
 */
export default function Terms() {
  return (
    <LegalPage title="Terms of Service" effective={LEGAL.effective}>
      <P>
        These terms cover your use of Homehub. By creating an account you agree to them. We have
        tried to keep them short and readable.
      </P>

      <Section heading="What Homehub is">
        <P>
          Homehub records the appliances and equipment in your home, reads their manuals, and
          suggests maintenance. It is an organizing and reference tool. It is not a professional
          inspection, a warranty, an insurance product, or a substitute for a qualified tradesperson.
        </P>
      </Section>

      <Section heading="Maintenance advice is a suggestion, not an instruction">
        <P>
          Homehub uses automated systems, including AI, to read manuals and propose tasks. Those
          systems make mistakes: a task can be wrong, mistimed, missing, or misapplied to the wrong
          model. Every suggestion is yours to accept, change, or reject, and you should confirm
          anything that matters against the manufacturer's own documentation.
        </P>
        <P>
          <b>
            Work involving gas, combustion, electrical systems, water supply, or anything at height
            carries real risk of injury, fire, flood, or death. Homehub is not a qualified
            professional and cannot assess your specific equipment or installation. Where a manual or
            local regulation calls for a licensed professional, hire one.
          </b>{" "}
          You are responsible for deciding what work to carry out and how.
        </P>
        <P>
          Recall information comes from third-party sources and may be incomplete or out of date. The
          absence of a recall notice in Homehub is not confirmation that no recall exists.
        </P>
      </Section>

      <Section heading="Your account">
        <Bullets
          items={[
            <>You need an account to use Homehub, and you are responsible for what happens under it.</>,
            <>Keep your sign-in details to yourself, and tell us if you think someone else has access.</>,
            <>You must be at least 13 years old.</>,
            <>Give accurate information — the maintenance plan is only as good as the details you enter.</>,
          ]}
        />
      </Section>

      <Section heading="Your content">
        <P>
          The manuals, photos, and details you add remain yours. You grant us only the permission
          needed to run the service for you: to store your content, and to process it through the
          services described in the{" "}
          <Link to="/privacy" style={{ color: "var(--hh-teal)", fontWeight: 600 }}>
            Privacy Policy
          </Link>{" "}
          so the app can do what you asked. We do not claim ownership and we do not use your content
          to train AI models.
        </P>
        <P>
          Only upload material you are entitled to upload. Manufacturer manuals are usually
          copyrighted; adding one for your own reference is ordinarily fine, but redistributing it is
          not something these terms permit.
        </P>
      </Section>

      <Section heading="Sharing a home">
        <P>
          Inviting someone to your home gives them access to the items, manuals, and tasks in it, and
          lets them change them. Invite only people you trust with that. You can remove someone at
          any time.
        </P>
      </Section>

      <Section heading="Fair use">
        <P>Please do not:</P>
        <Bullets
          items={[
            <>break the law with it, or use it to harm someone;</>,
            <>attempt to access another person's home or account;</>,
            <>probe, scrape, overload, or reverse-engineer the service;</>,
            <>resell it or pass it off as your own.</>,
          ]}
        />
      </Section>

      <Section heading="Availability">
        <P>
          Homehub is offered as it is. It is early software, provided without warranties of any kind,
          and it needs an internet connection to work. We may change, suspend, or discontinue any
          part of it. If we intend to shut the service down, we will give you reasonable notice and a
          way to export your data first.
        </P>
      </Section>

      <Section heading="Limits on liability">
        <P>
          To the fullest extent the law allows, Homehub and its operator are not liable for indirect
          or consequential loss, for lost data, or for damage arising from maintenance work you chose
          to carry out or chose not to carry out. Nothing in these terms limits liability for death
          or personal injury caused by our negligence, for fraud, or for anything else that cannot
          lawfully be limited.
        </P>
      </Section>

      <Section heading="Ending it">
        <P>
          You can stop using Homehub and delete your account at any time; see the Privacy Policy for
          how. We may suspend or close an account that breaches these terms, and will tell you why
          where we reasonably can.
        </P>
      </Section>

      <Section heading="Changes to these terms">
        <P>
          If we change these terms materially, we will let you know in the app before the change
          takes effect. Continuing to use Homehub after that means you accept the new version.
        </P>
      </Section>

      <Section heading="Governing law">
        <P>These terms are governed by the laws of {LEGAL.governingLaw}.</P>
      </Section>

      <Section heading="Contact">
        <P>
          Questions about these terms:{" "}
          <a href={`mailto:${LEGAL.contactEmail}`} style={{ color: "var(--hh-teal)", fontWeight: 600 }}>
            {LEGAL.contactEmail}
          </a>
          .
        </P>
      </Section>
    </LegalPage>
  )
}
