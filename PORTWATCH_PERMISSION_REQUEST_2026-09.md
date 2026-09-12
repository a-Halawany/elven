# Permission request — IMF PortWatch daily chokepoint and port data (redraft, 2026-09-08)

> **Prepared for the owner to send. Nothing has been sent.** This redraft replaces the draft on
> PR #36. It describes what exists today — a development and evaluation deployment — rather than an
> operating platform, discloses that the product is intended for customers, and asks the IMF which
> of its terms apply and what permission is needed, instead of asserting a use. Fill in the
> bracketed fields before sending. Until a written reply is received and recorded on the source
> contract, PortWatch stays in **replay** with `rights_state: pending` and the platform makes no
> request to the IMF's servers.

**To:** copyright@imf.org
**Cc:** IMF-PortWatch@IMF.org
**Subject:** Permission and applicable terms — bounded automated collection of PortWatch daily chokepoint and port transit data (evaluation now; possible commercial use later)

---

Dear IMF Copyright team, dear PortWatch team,

I am writing on behalf of [Organisation], which is developing a supply-chain monitoring and
decision-support product called "The Eye". I would like to ask (1) for permission for a bounded,
automated collection of two PortWatch datasets for our current internal evaluation, and (2) which
of the IMF's terms would govern two possible future uses, and what further permission each would
need. I have read the IMF Copyright and Usage terms, including the special provisions for
statistical data, and the PortWatch FAQ, which directs commercial redistribution questions to your
address; I am asking rather than assuming.

**The datasets**

- PortWatch Daily Chokepoints Data (ArcGIS item `3da2b9ca97684916b75c4013f95d18ab`), and
- the corresponding PortWatch daily port data.

**What exists today (the current request)**

The Eye is presently a development and evaluation deployment used by our own team. No customer
uses it, no data from it is published, and nothing derived from PortWatch has been shared outside
the team. Within that deployment we would like to:

1. perform a **one-time historical backfill** of the daily chokepoint series from 2019-01-01 to
   the present for three chokepoints (Bab el-Mandeb, the Suez Canal and the Strait of Hormuz) and
   of the daily port series for two ports — approximately 8,400 chokepoint rows and a comparable
   number of port rows, retrieved in ordered pages through the public ArcGIS FeatureServer query
   endpoint at well under one request per second; and
2. collect **new rows once per day** for the same chokepoints and ports thereafter.

The terms permit non-systematic download; because a scheduled daily collection and a historical
backfill are systematic, I am asking for permission for exactly this scope, for the evaluation.

How the data is handled in the platform: the original bytes are preserved unmodified with
cryptographic digests; derived values are marked as derived; publisher revisions are recorded as
revisions, never overwritten; every use inside the platform carries the attribution "Source: IMF
PortWatch (IMF / Oxford)" with a link to portwatch.imf.org; collection is capped per run by a
contract our own system enforces, and we will honour any rate or volume limit you specify. If a
bulk download or a preferred endpoint exists for historical data, we will use it instead of paging
the FeatureServer.

**Possible future uses (questions, not requests)**

The product is intended to be offered to customers. Two uses may arise later, and I would like to
know in advance which terms apply and what permission each would require, so that we do not exceed
what we are allowed:

- **Commercial deployment**: the same bounded collection running in a deployment operated for
  paying customers, with PortWatch data used internally by our system to compute risk and
  early-warning signals.
- **Customer-facing derived analyses**: showing customers figures derived from PortWatch data
  (for example a transit-count trend or an anomaly flag for a chokepoint), with attribution, and
  possibly exporting such figures in reports. We are not asking to redistribute the datasets
  themselves; if a derived figure would count as redistribution under your terms, please say so.

For each, I would be grateful to know: which provisions of the Copyright and Usage terms and the
statistical-data provisions apply; whether a licence, a data-use agreement or a written permission
is required; and whether any fee, attribution wording, or restriction on granularity, latency or
retention applies.

**What we would record**

Your reply will be recorded verbatim as the rights evidence on the source's contract inside the
platform, so that the permission — and every condition attached to it — travels with the data and
is visible wherever the data is used. Until then the source remains in replay and no automated
request is made to your servers.

Thank you for making PortWatch available, and for considering this request.

Kind regards,

[Owner's name]
[Role], [Organisation]
[Contact address] · [Telephone]
