import type { CSSProperties } from "react";
import {
  type OrcamentoState,
  calcTotais,
  fmtEurPT,
  fmtDatePT,
  validadeDate,
} from "@/lib/orcamento";

export interface EstudoEnergetico {
  potenciaInstalada: number;
  numPaineis?: number;
  producaoAnual: number;
  autoconsumoAnual?: number;
  excessoAnual?: number;
  autoconsumoPerc: number;
  poupancaAnual: number;
  paybackAnos: number;
  investimento?: number;
  poupanca10?: number;
  poupanca15?: number;
  poupanca25?: number;
  npv25?: number;
  co2Anual?: number;
}

interface Props {
  state: OrcamentoState;
  estudo?: EstudoEnergetico | null;
}

/* ─── style constants as CSSProperties objects ──────────────────────────── */
const LABEL: CSSProperties = {
  fontSize: 9, textTransform: "uppercase", letterSpacing: ".06em",
  color: "#6b7280", fontWeight: 600,
};
const TH: CSSProperties = {
  border: "1px solid #d1d5db", background: "#f3f4f6",
  padding: "4px 8px", textAlign: "left", fontSize: 10,
  fontWeight: 600, color: "#374151",
};
const TD: CSSProperties = {
  border: "1px solid #d1d5db", padding: "4px 8px",
  fontSize: 10, color: "#1f2937",
};
const TDR: CSSProperties = { ...TD, textAlign: "right" };

function fmt2(n: number) {
  return n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmt0(n: number) {
  return n.toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/* ── accent colour used throughout ─────────────────────────────────────── */
const ACCENT = "#f59e0b"; // amber-400

export default function OrcamentoPDF({ state, estudo }: Props) {
  const {
    codigo, dataEmissao, validadeDias, moeda, taxaIva,
    empresaNome, empresaMorada, empresaNif, empresaTelefone, empresaEmail,
    empresaWebsite, empresaIban, empresaLogoUrl,
    nomeCliente, nifCliente, moradaCliente, moradaInstalacao,
    linhas, observacoes, condicoesPagamento, incluirEstudoEnergetico,
  } = state;

  const { totalLiquido, totalIva, totalFinal } = calcTotais(linhas, taxaIva);
  const dataValidade = validadeDate(dataEmissao, validadeDias);

  /* company initials for logo placeholder */
  const initials = empresaNome
    ?empresaNome.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()
    : "☀";

  return (
    <div
      id="orcamento-print-content"
      style={{
        fontFamily: "Arial, Helvetica, sans-serif",
        background: "#fff",
        color: "#111827",
        maxWidth: 780,
        margin: "0 auto",
        padding: "0 0 32px 0",
      }}
    >
      {/* ── Accent bar ────────────────────────────────────────────────── */}
      <div style={{ background: ACCENT, height: 6, width: "100%" }} />

      {/* ── Header: Company + Budget info ─────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "20px 32px 16px" }}>
        {/* Left: logo + company */}
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          {empresaLogoUrl ? (
            <img
              src={empresaLogoUrl}
              alt={empresaNome || "Logotipo"}
              style={{ width: 72, height: 48, objectFit: "contain", flexShrink: 0 }}
            />
          ) : (
            <div style={{
              width: 48, height: 48, borderRadius: 6, background: ACCENT,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 700, color: "#fff", flexShrink: 0,
            }}>
              {initials}
            </div>
          )}
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", textTransform: "uppercase", letterSpacing: ".04em" }}>
              {empresaNome || "Nome da Empresa"}
            </div>
            {empresaMorada && (
              <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2, whiteSpace: "pre-line" }}>{empresaMorada}</div>
            )}
            <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>
              {[
                empresaTelefone && `Tel: ${empresaTelefone}`,
                empresaEmail && empresaEmail,
                empresaNif && `NIF: ${empresaNif}`,
              ].filter(Boolean).join("  ·  ")}
            </div>
            {empresaWebsite && (
              <div style={{ fontSize: 10, color: "#6b7280" }}>{empresaWebsite}</div>
            )}
          </div>
        </div>

        {/* Right: budget metadata */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: ACCENT, letterSpacing: ".02em" }}>ORÇAMENTO</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginTop: 2 }}>{codigo}</div>
          <table style={{ fontSize: 10, borderCollapse: "collapse", marginTop: 6, marginLeft: "auto" }}>
            <tbody>
              <tr>
                <td style={{ padding: "2px 8px 2px 0", color: "#6b7280" }}>Data de emissão</td>
                <td style={{ padding: "2px 0", fontWeight: 600 }}>{fmtDatePT(dataEmissao)}</td>
              </tr>
              <tr>
                <td style={{ padding: "2px 8px 2px 0", color: "#6b7280" }}>Válido até</td>
                <td style={{ padding: "2px 0", fontWeight: 600 }}>{fmtDatePT(dataValidade)}</td>
              </tr>
              <tr>
                <td style={{ padding: "2px 8px 2px 0", color: "#6b7280" }}>Moeda</td>
                <td style={{ padding: "2px 0" }}>{moeda}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Divider ───────────────────────────────────────────────────── */}
      <div style={{ height: 2, background: "#e5e7eb", margin: "0 32px" }} />

      {/* ── Client + Installation ─────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 16, padding: "14px 32px" }}>
        {/* Billing / Client */}
        <div style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 6, padding: "10px 14px" }}>
          <div style={LABEL}>Cliente / Faturação</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>{nomeCliente || "—"}</div>
          {moradaCliente && (
            <div style={{ fontSize: 10, color: "#374151", marginTop: 3, whiteSpace: "pre-line" }}>{moradaCliente}</div>
          )}
          {nifCliente && (
            <div style={{ fontSize: 10, color: "#6b7280", marginTop: 3 }}>NIF: <span style={{ fontWeight: 600, color: "#111827" }}>{nifCliente}</span></div>
          )}
        </div>

        {/* Installation address */}
        <div style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 6, padding: "10px 14px" }}>
          <div style={LABEL}>Local de Instalação</div>
          {moradaInstalacao ?(
            <div style={{ fontSize: 11, color: "#374151", marginTop: 4, whiteSpace: "pre-line" }}>{moradaInstalacao}</div>
          ) : moradaCliente ?(
            <div style={{ fontSize: 11, color: "#374151", marginTop: 4, whiteSpace: "pre-line" }}>{moradaCliente}</div>
          ) : (
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>—</div>
          )}
        </div>
      </div>

      {/* ── Components table ──────────────────────────────────────────── */}
      <div style={{ padding: "0 32px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "#374151", marginBottom: 6 }}>
          Componentes e Serviços
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: "8%" }}>Ref.</th>
              <th style={{ ...TH, width: "42%" }}>Descrição</th>
              <th style={{ ...TH, width: "14%", textAlign: "right" }}>Preço Unit.</th>
              <th style={{ ...TH, width: "8%",  textAlign: "right" }}>Quant.</th>
              <th style={{ ...TH, width: "10%", textAlign: "right" }}>IVA</th>
              <th style={{ ...TH, width: "18%", textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => {
              const lineTotal = l.quantidade * l.precoUnitario;
              return (
                <tr key={l.id} style={{ background: i % 2 === 0 ?"#fff" : "#f9fafb" }}>
                  <td style={TD as React.CSSProperties}>{l.codigo}</td>
                  <td style={TD as React.CSSProperties}>{l.descricao}</td>
                  <td style={TDR as React.CSSProperties}>{l.precoUnitario > 0 ?fmt2(l.precoUnitario) : ""}</td>
                  <td style={TDR as React.CSSProperties}>{l.quantidade > 0 ?l.quantidade : ""}</td>
                  <td style={TDR as React.CSSProperties}>{l.ivaPerc > 0 ?`${l.ivaPerc}%` : ""}</td>
                  <td style={{ ...(TDR as React.CSSProperties), fontWeight: lineTotal > 0 ?600 : 400 }}>
                    {lineTotal > 0 ?`${fmt2(lineTotal)} €` : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Notes + Totals ────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 24, padding: "12px 32px", alignItems: "flex-start" }}>
        {/* Observations + Payment */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {observacoes && (
            <div style={{ marginBottom: 8 }}>
              <div style={LABEL}>Observações</div>
              <div style={{ fontSize: 10, color: "#374151", marginTop: 3, whiteSpace: "pre-line" }}>{observacoes}</div>
            </div>
          )}
          {condicoesPagamento && (
            <div>
              <div style={LABEL}>Condições de Pagamento</div>
              <div style={{ fontSize: 10, color: "#374151", marginTop: 3 }}>{condicoesPagamento}</div>
            </div>
          )}
        </div>

        {/* Totals */}
        <div style={{ minWidth: 220, flexShrink: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <tbody>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                <td style={{ padding: "5px 12px 5px 0", color: "#6b7280" }}>Total Líquido</td>
                <td style={{ padding: "5px 0", textAlign: "right", fontWeight: 600 }}>{fmtEurPT(totalLiquido)}</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                <td style={{ padding: "5px 12px 5px 0", color: "#6b7280" }}>IVA <strong>{taxaIva}%</strong></td>
                <td style={{ padding: "5px 0", textAlign: "right" }}>{fmtEurPT(totalIva)}</td>
              </tr>
              <tr style={{ background: "#fef3c7" }}>
                <td style={{ padding: "7px 12px 7px 0", fontWeight: 700, fontSize: 12 }}>Total Final</td>
                <td style={{ padding: "7px 0", textAlign: "right", fontWeight: 800, fontSize: 13, color: ACCENT }}>
                  {fmtEurPT(totalFinal)}
                </td>
              </tr>
            </tbody>
          </table>
          {empresaIban && (
            <div style={{ fontSize: 9, color: "#6b7280", marginTop: 6 }}>
              <span style={{ fontWeight: 600 }}>IBAN:</span> {empresaIban}
            </div>
          )}
        </div>
      </div>

      {/* ── Energy Study ──────────────────────────────────────────────── */}
      {incluirEstudoEnergetico && estudo && (
        <div style={{ margin: "8px 32px 0", border: `1px solid ${ACCENT}`, borderRadius: 8, overflow: "hidden" }}>
          {/* Study header */}
          <div style={{ background: ACCENT, padding: "8px 16px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", letterSpacing: ".02em" }}>
              ☀ Estudo de Produção Solar e Poupança Estimada
            </div>
          </div>

          <div style={{ padding: "14px 16px", background: "#fffbeb" }}>

            {/* ── Production metrics row ── */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {[
                { label: "Potência Instalada", val: `${estudo.potenciaInstalada.toFixed(2)} kWp` },
                ...(estudo.numPaineis != null ?[{ label: "N.º de Painéis", val: `${estudo.numPaineis} un.` }] : []),
                { label: "Produção Anual Est.", val: `${fmt0(estudo.producaoAnual)} kWh` },
                ...(estudo.autoconsumoAnual != null ?[{ label: "Autoconsumo", val: `${fmt0(estudo.autoconsumoAnual)} kWh` }] : []),
                ...(estudo.excessoAnual != null ?[{ label: "Excedente Injetado", val: `${fmt0(estudo.excessoAnual)} kWh` }] : []),
                ...(estudo.co2Anual != null ?[{ label: "CO₂ Evitado/ano", val: `${estudo.co2Anual.toFixed(1)} t CO₂` }] : []),
              ].map(({ label, val }) => (
                <div key={label} style={{
                  flex: 1, background: "#fff", border: "1px solid #fde68a",
                  borderRadius: 6, padding: "8px 10px",
                }}>
                  <div style={LABEL}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginTop: 3 }}>{val}</div>
                </div>
              ))}
            </div>

            {/* ── Energy flow bar ── */}
            {estudo.autoconsumoAnual != null && estudo.excessoAnual != null && estudo.producaoAnual > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>
                  Distribuição da Produção
                </div>
                <div style={{ display: "flex", height: 18, borderRadius: 4, overflow: "hidden", border: "1px solid #e5e7eb" }}>
                  <div style={{
                    width: `${estudo.autoconsumoPerc}%`,
                    background: "#16a34a",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, color: "#fff", fontWeight: 700,
                  }}>
                    {estudo.autoconsumoPerc > 10 ?`Autoconsumo ${estudo.autoconsumoPerc}%` : `${estudo.autoconsumoPerc}%`}
                  </div>
                  <div style={{
                    flex: 1,
                    background: "#f59e0b",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, color: "#fff", fontWeight: 700,
                  }}>
                    {(100 - estudo.autoconsumoPerc) > 10
                      ?`Excedente ${100 - estudo.autoconsumoPerc}%`
                      : `${100 - estudo.autoconsumoPerc}%`}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "#374151" }}>
                    <div style={{ width: 10, height: 10, background: "#16a34a", borderRadius: 2 }} />
                    Autoconsumido ({fmt0(estudo.autoconsumoAnual)} kWh)
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "#374151" }}>
                    <div style={{ width: 10, height: 10, background: ACCENT, borderRadius: 2 }} />
                    Injetado na rede ({fmt0(estudo.excessoAnual)} kWh)
                  </div>
                </div>
              </div>
            )}

            {/* ── Financial KPIs ── */}
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1, background: "#fff", border: "1px solid #bbf7d0", borderRadius: 6, padding: "10px 12px", textAlign: "center" }}>
                <div style={LABEL}>Poupança Anual Est.</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#16a34a", marginTop: 4 }}>
                  {fmtEurPT(estudo.poupancaAnual)}
                </div>
                <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>energia + injeção na rede</div>
              </div>

              <div style={{ flex: 1, background: "#fff", border: `1px solid ${ACCENT}`, borderRadius: 6, padding: "10px 12px", textAlign: "center" }}>
                <div style={LABEL}>Payback Simples Est.</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: ACCENT, marginTop: 4 }}>
                  {estudo.paybackAnos > 25 ?"> 25" : estudo.paybackAnos} anos
                </div>
                <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>com escalada tarifária 3%/ano</div>
              </div>

              {estudo.npv25 != null && (
                <div style={{ flex: 1, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: "10px 12px", textAlign: "center" }}>
                  <div style={LABEL}>VAL a 25 Anos</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: estudo.npv25 >= 0 ?"#16a34a" : "#dc2626", marginTop: 4 }}>
                    {fmtEurPT(estudo.npv25)}
                  </div>
                  <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>taxa de desconto 4%</div>
                </div>
              )}

              {estudo.investimento != null && (
                <div style={{ flex: 1, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: "10px 12px", textAlign: "center" }}>
                  <div style={LABEL}>Investimento Total</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#111827", marginTop: 4 }}>
                    {fmtEurPT(estudo.investimento)}
                  </div>
                  <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>valor do orçamento</div>
                </div>
              )}
            </div>

            {/* ── Accumulated savings table ── */}
            {(estudo.poupanca10 != null || estudo.poupanca15 != null || estudo.poupanca25 != null) && (
              <div>
                <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>
                  Poupança Acumulada Estimada
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={TH as React.CSSProperties}>Horizonte temporal</th>
                      <th style={{ ...(TH as React.CSSProperties), textAlign: "right" }}>Poupança Acumulada</th>
                      {estudo.npv25 != null && (
                        <th style={{ ...(TH as React.CSSProperties), textAlign: "right" }}>VAL Acumulado (desc. 4%)</th>
                      )}
                      <th style={{ ...(TH as React.CSSProperties), textAlign: "right" }}>Nota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estudo.poupanca10 != null && (
                      <tr style={{ background: "#fff" }}>
                        <td style={TD as React.CSSProperties}>10 anos</td>
                        <td style={{ ...(TDR as React.CSSProperties), color: estudo.poupanca10 >= 0 ?"#16a34a" : "#dc2626", fontWeight: 600 }}>
                          {fmtEurPT(estudo.poupanca10)}
                        </td>
                        {estudo.npv25 != null && <td style={TDR as React.CSSProperties}>—</td>}
                        <td style={TDR as React.CSSProperties}>Médio prazo</td>
                      </tr>
                    )}
                    {estudo.poupanca15 != null && (
                      <tr style={{ background: "#f9fafb" }}>
                        <td style={TD as React.CSSProperties}>15 anos</td>
                        <td style={{ ...(TDR as React.CSSProperties), color: estudo.poupanca15 >= 0 ?"#16a34a" : "#dc2626", fontWeight: 600 }}>
                          {fmtEurPT(estudo.poupanca15)}
                        </td>
                        {estudo.npv25 != null && <td style={TDR as React.CSSProperties}>—</td>}
                        <td style={TDR as React.CSSProperties}>Garantia equipamentos</td>
                      </tr>
                    )}
                    {estudo.poupanca25 != null && (
                      <tr style={{ background: "#fef9c3" }}>
                        <td style={{ ...(TD as React.CSSProperties), fontWeight: 700 }}>25 anos (vida útil)</td>
                        <td style={{ ...(TDR as React.CSSProperties), color: "#16a34a", fontWeight: 800, fontSize: 12 }}>
                          {fmtEurPT(estudo.poupanca25)}
                        </td>
                        {estudo.npv25 != null && (
                          <td style={{ ...(TDR as React.CSSProperties), fontWeight: 600 }}>{fmtEurPT(estudo.npv25)}</td>
                        )}
                        <td style={TDR as React.CSSProperties}>Vida útil dos painéis</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ fontSize: 8, color: "#9ca3af", marginTop: 8, borderTop: "1px solid #fde68a", paddingTop: 6 }}>
              * Valores estimados com base em dados PVGIS e perfil de consumo do cliente. Sujeitos a confirmação técnica in loco.
              Cálculo com escalada tarifária de 3%/ano, degradação dos painéis de 0,5%/ano e taxa de desconto VAL de 4%.
              Não constituem aconselhamento financeiro ou garantia de poupança.
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <div style={{ margin: "16px 32px 0", paddingTop: 12, borderTop: "1px solid #e5e7eb" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            {empresaIban && (
              <div style={{ fontSize: 10, color: "#374151" }}>
                <span style={{ fontWeight: 600 }}>IBAN:</span> {empresaIban}
              </div>
            )}
            <div style={{ marginTop: 16, borderTop: "1px solid #6b7280", paddingTop: 4, width: 240 }}>
              <div style={{ fontSize: 9, color: "#9ca3af" }}>Assinatura do cliente</div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ marginTop: 16, borderTop: "1px solid #6b7280", paddingTop: 4, width: 200 }}>
              <div style={{ fontSize: 9, color: "#9ca3af" }}>Assinatura e carimbo — {empresaNome || "Empresa"}</div>
            </div>
          </div>
        </div>
        <div style={{ textAlign: "center", fontSize: 9, color: "#d1d5db", marginTop: 10 }}>
          {codigo} · Emitido em {fmtDatePT(dataEmissao)} · Página 1 de 1
        </div>
      </div>
    </div>
  );
}
