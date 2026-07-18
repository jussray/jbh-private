# L99 Sales Authority — Private Hair

States: `observed → qualified → sampled → offer_draft → devil_reviewed → founder_approved → contacted → ordered → fulfilled → retained | refunded | stopped`.

No state authorizes the next.

Separate founder gates are required for vendor contact, sample purchase, inventory purchase, price/discount change, customer outreach, public claim, refund, credential use, database mutation, deployment, and rollback.

Evidence binds project, product/SKU, offer version, supplier record, sample result, landed-cost assumptions, exact catalog state, decision owner, timestamp, and next gate. Public reports must exclude vendor identities, costs, customer/order data, credentials, and private strategy.

Ambiguous or duplicate execution fails closed and is reconciled before retry.