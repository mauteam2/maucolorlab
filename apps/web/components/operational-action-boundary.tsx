"use client";
import type {ReactNode} from "react";
import Link from "next/link";
/** Existing client actions and inventory signals share a source-driven operational
 * entry point. Inventory never fabricates a client CRM action or procurement task. */
export function OperationalActionBoundary({domain,permissions,children}:{domain:"CRM"|"STOCK";permissions:readonly string[];children:ReactNode}){
 return <section aria-label="Operasyon aksiyon merkezi"><nav className="stock-toolbar" aria-label="Aksiyon alanı">{permissions.includes("crm.read")&&(domain==="CRM"?<strong>Müşteri ilişkileri</strong>:<Link href="/workspace/clients">Müşteri ilişkileri aksiyonları</Link>)}{permissions.includes("stock.view")&&(domain==="STOCK"?<strong>Stok</strong>:<Link href="/workspace/stock">Stok aksiyonları</Link>)}</nav>{children}</section>;
}
