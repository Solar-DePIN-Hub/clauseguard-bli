// Fictional sample contracts written for the demo. They are not real agreements.
const SAMPLES = {
risky: `ROOFTOP SOLAR POWER PURCHASE AGREEMENT (sample, fictional)
1. The Seller installs a 30 kW solar system on the Host's roof. Energy will be sold to the Host at 0.12 EUR per kWh.
2. The Seller may change the price at any time at its sole discretion.
3. The Seller shall not be liable for any damage to the roof, building or equipment.
4. If the Host ends this Agreement early, the Host shall pay all remaining payments for the full 20-year term as a termination fee.
5. Consumption data of the household will be collected by the Seller's app.
6. This Agreement is governed by the laws of Delaware.`,
fair: `ROOFTOP SOLAR POWER PURCHASE AGREEMENT (sample, fictional)
1. Term. This Agreement runs for 15 years. Either party may terminate on 60 days' notice after a material breach that is not cured within 30 days.
2. Price. Energy is sold at a fixed price of 0.11 EUR per kWh, with escalation of 2% per year.
3. Metering. Energy is measured by a certified meter at the connection point; either party may request a calibration test.
4. Curtailment. Energy curtailed by the Buyer is paid as deemed energy. Curtailment ordered by the grid operator is shared equally.
5. Force majeure. Force majeure includes war, grid failure and natural disasters; after 90 days either party may terminate.
6. Insurance. The Seller keeps property and liability insurance for the System.
7. Limitation of liability. Each party's aggregate liability is capped at the fees paid in the previous 12 months, except for fraud or gross negligence.
8. Data protection. Meter data is personal data and is processed only for billing in line with the GDPR.
9. Assignment. Either party may assign this Agreement to a successor with written notice.
10. Disputes. Disputes go to mediation for 30 days, then to the courts of Kyiv. This Agreement is governed by the laws of Ukraine.`,
token: `SOLAR REVENUE SHARE TOKEN TERMS (sample, fictional)
1. The Issuer will mint 10,000 tokens. Each token gives investors a revenue share of 0.01% of the energy sales of the Sunrise solar park.
2. Payouts are made monthly by a smart contract to the investor's wallet.
3. The Issuer reserves the right to change the payout formula without notice.
4. The Issuer will not be liable for any loss of tokens or payouts.
5. These terms are governed by the laws of the Cayman Islands.`
};
if (typeof module !== 'undefined') module.exports = SAMPLES;
