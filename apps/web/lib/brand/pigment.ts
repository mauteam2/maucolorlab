import { pigmentDimensions, technicalFact, type Product } from "./model";
import { verifiedFact } from "./engine";
/** Source-scale channels are independent documented observations, not pigment percentages.
 * Missing channels remain null. Arithmetic across different scales is deliberately absent. */
export function readPigmentVector(product:Product,allowSalon=false) {
 return {schemaVersion:"pigment-vector/1.0.0" as const,productVersion:product.version,
  channels:Object.fromEntries(pigmentDimensions.map(key=>[key,verifiedFact(product,key,allowSalon)??technicalFact.parse({key,value:null,unit:null,source:"UNKNOWN",verificationStatus:"UNVERIFIED",sourceReference:null,version:product.version,verifiedBy:null,verifiedAt:null,confidence:null})]))};
}
