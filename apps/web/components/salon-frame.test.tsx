import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { salonFixture } from "@/test/salon-fixtures";
import { SalonFrame } from "./salon-frame";
afterEach(cleanup);
it("marks exactly one current section and never links unfinished modules into the live workspace", () => {
 render(<SalonFrame active="clients" context={{...salonFixture().context, permissions:[...salonFixture().context.permissions,"finance.view","reports.read"]}}><main id="main-content">Müşteri içeriği</main></SalonFrame>);
 const navigation=screen.getByRole("navigation",{name:"Ana gezinti"});
 expect(navigation.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
 expect(screen.getByRole("link",{name:"Müşteriler bölümü"})).toHaveAttribute("href","/workspace/clients");
 expect(screen.getByRole("link",{name:"Finans bölümü"})).toHaveAttribute("href","/workspace/finance");
 expect(screen.getByRole("link",{name:"Raporlar bölümü"})).toHaveAttribute("href","/workspace/reports");
 expect(screen.getByRole("link",{name:"Randevular bölümü"})).toHaveAttribute("href","/workspace/appointments");
 expect(screen.getByRole("link",{name:"Ekip bölümü"})).toHaveAttribute("href","/workspace/team");
 expect(screen.getByRole("link",{name:"Ayarlar bölümü"})).toHaveAttribute("href","/workspace/settings");
});
it("opens the mobile menu and gives a skip link to the actual main content", () => {
 render(<SalonFrame active="dashboard"><main id="main-content"/></SalonFrame>);
 const button=screen.getByRole("button",{name:"Menü"});
 expect(button).toHaveAttribute("aria-expanded","false");fireEvent.click(button);
 expect(button).toHaveAttribute("aria-expanded","true");
 expect(screen.getByRole("link",{name:"İçeriğe geç"})).toHaveAttribute("href","#main-content");
});
it("conceals cached tenant content and workspace labels on account-change notification", () => {
 render(<SalonFrame active="clients" workspace="Private salon"><main>Private customer</main></SalonFrame>);
 fireEvent(window, new Event("elifora-offline-lock"));
 expect(screen.queryByText("Private customer")).not.toBeInTheDocument();
 expect(screen.queryByText("Private salon")).not.toBeInTheDocument();
 expect(screen.getByRole("link", { name: "Çalışma alanını yeniden aç" })).toHaveAttribute("href", "/workspace");
});

it("conceals technical and financial navigation from reception and unknown sessions", () => {
 const {rerender}=render(<SalonFrame active="clients" context={{...salonFixture().context,role:"reception",permissions:["clients.read","salon.read"]}}><main/></SalonFrame>);
 expect(screen.queryByRole("link",{name:"ColorLab bölümü"})).toBeNull();
 expect(screen.queryByRole("link",{name:"Marka kütüphanesi bölümü"})).toBeNull();
 expect(screen.queryByRole("link",{name:"Finans bölümü"})).toBeNull();
 expect(screen.getByRole("link",{name:"Müşteriler bölümü"})).toBeVisible();
 rerender(<SalonFrame active="clients" context={null}><main/></SalonFrame>);
 expect(screen.queryByRole("link",{name:"Müşteriler bölümü"})).toBeNull();
});
it("Escape closes navigation and restores keyboard focus", () => {
 render(<SalonFrame active="dashboard" context={null}><main/></SalonFrame>);
 const button=screen.getByRole("button",{name:"Menü"});fireEvent.click(button);fireEvent.keyDown(button,{key:"Escape"});
 expect(button).toHaveAttribute("aria-expanded","false");expect(button).toHaveFocus();
});
