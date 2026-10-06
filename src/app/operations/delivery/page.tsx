import type { Metadata } from "next";
import { DeliveryOperations } from "@/components/operations/DeliveryOperations";
export const metadata: Metadata = { title: "Delivery operations | VetLinX" };
export default function DeliveryPage() { return <DeliveryOperations />; }
