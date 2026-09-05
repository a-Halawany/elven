# Permission request — IMF PortWatch daily chokepoint and port data

> **Prepared for the owner to send. Nothing has been sent.** The wording is a draft; the owner
> should confirm the organisation name, the contact address, and the recipient before sending.
> The IMF's own terms page (`https://www.imf.org/external/terms.htm`) returns `403` to automated
> fetches, so the summary of its conditions below was taken from the published terms as indexed —
> **please read the page yourself before relying on it.**

**Suggested recipient.** The PortWatch team's published contact (the platform is a joint IMF /
Oxford Sustainable Finance Group initiative; the contact address is listed on
`https://portwatch.imf.org`), copying the IMF Copyright and Usage contact named on the terms page.

**Subject:** Request for permission — systematic download of PortWatch daily chokepoint and port
transit data for internal analysis

---

Dear PortWatch team,

We operate an internal, non-commercial decision-support platform ("The Eye") used to monitor
supply-chain exposure to maritime chokepoints. We would like to use the IMF PortWatch **Daily
Chokepoints Data** (ArcGIS item `3da2b9ca97684916b75c4013f95d18ab`) and the corresponding **daily
port data**, and we are writing to request permission for the specific use below, because the
dataset's `licenseInfo` refers to the IMF's general Copyright and Usage terms, which permit
non-systematic download but require permission for systematic downloading or substantial re-use.

**What we are asking permission for**

1. A **one-time historical backfill** of the daily chokepoint series from 2019-01-01 to the present
   for a small number of chokepoints relevant to our corridors (initially three: Bab el-Mandeb,
   Suez Canal and the Strait of Hormuz), and of the daily port series for a small number of ports
   (initially two). This is approximately 8,400 chokepoint rows and a comparable number of port
   rows, retrieved in pages through the public ArcGIS FeatureServer query endpoint with explicit
   ordering, at a rate well below one request per second.
2. **Ongoing daily collection** of new rows for the same chokepoints and ports, one request per
   series per day.

**How the data will be used**

- **Internal analysis only.** The data feeds forecasts and early warnings for our own operational
  decisions. It is not redistributed, resold, republished, or made available outside our
  organisation.
- **Attribution.** Every use of the data inside the platform carries the attribution "Source: IMF
  PortWatch (IMF / Oxford)" and a link to the platform, and any derived figures are marked as ours
  rather than as IMF figures.
- **Integrity.** The original bytes are preserved unmodified with cryptographic digests; derived
  values are marked as derived. Publisher revisions are recorded as revisions, never overwritten.
- **Bounded collection.** Requests are capped per run by a contract that our own system enforces;
  we will honour any rate or volume limits you specify.

**What we would record**

If you grant this, we will record your reply as the rights evidence on the source's contract
inside our platform, so that the permission — and any conditions attached to it — travels with the
data and is visible wherever the data is used.

If a formal data-use agreement or a different channel is preferred, we are happy to follow it. If
there is a bulk download or a preferred endpoint for historical data that you would rather we use
instead of paging the FeatureServer, we will use that.

Thank you for making PortWatch available, and for considering this request.

Kind regards,

*[Owner's name]*
*[Organisation]*
*[Contact address]*

---

**Until a reply is received:** PortWatch stays in **replay** mode with `rights_state: pending`, and
no request is made to the IMF's servers by the platform. This is Phase 1's posture and it is
unchanged.
