import { historyKey } from './consumption-history';

export function productKey(name: string) {
  const key = historyKey(name);
  const aliases: Record<string, string> = {
    liquid: 'liquidchlorine', cloroliquido: 'liquidchlorine',
    muriatic: 'muriaticacid', acidomuriatico: 'muriaticacid',
    tablets: 'tabs', chlorinetablets: 'tabs', cloroentabletas: 'tabs',
    estabilizador: 'stabilizer', defilter: 'defilterpowder', depowder: 'defilterpowder',
    cloroenpolvo: 'chlorinepowder', bicarbonato: 'bicarbonate', sal: 'salt',
    fosfato: 'phosphates', fosfatos: 'phosphates', phosphate: 'phosphates',
  };
  return aliases[key] || key;
}

export function unitKey(unit: string) {
  const key = unit.trim().toLowerCase();
  const aliases: Record<string, string> = {
    gallon: 'gal', gallons: 'gal', gals: 'gal', bags: 'bag', scoops: 'scoop',
    units: 'qty', unit: 'qty', quantity: 'qty', ounces: 'oz', ounce: 'oz',
  };
  return aliases[key] || key;
}
