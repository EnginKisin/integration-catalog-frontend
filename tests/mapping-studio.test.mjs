import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { defaultExpanded, studioSchemaTree, visibleStudioFields } from '../src/lib/mappingStudio.ts'

const schema = (schemaDefinition) => ({ id: 40, schemaType: 'SOURCE_TO_MW_REQUEST', format: 'JSON', schemaDefinition })
describe('Gerçek şemadan editör alan ağacı', () => {
  it('250 alanın ötesini korur; kaydetme yollarını ve örnek değerlerini değiştirmez', () => {
    const fields = Object.fromEntries(Array.from({ length: 750 }, (_, index) => [`field${index}`, index]))
    const tree = studioSchemaTree(schema({ attributes: fields }), 'sample')
    assert.equal(tree.fields.length, 751)
    assert.equal(tree.truncated, false)
    assert.equal(tree.fields.at(-1).path, 'attributes.field749')
    assert.equal(tree.fields.at(-1).value, '749')
    assert.equal(tree.fields.at(-1).parent, 'attributes')
    assert.equal(tree.fields[0].children.length, 750)
  })
  it('özel JSON anahtarlarını, false/sıfır değerlerini ve JSON Schema örneklerini korur', () => {
    const tree = studioSchemaTree(schema({ 'a.b': { 'x[y]': false, empty: 0 } }), 'sample')
    assert.deepEqual(tree.fields.map((field) => field.name), ['a.b', 'x[y]', 'empty'])
    assert.deepEqual(tree.fields.slice(1).map((field) => field.value), ['false', '0'])
    assert.equal(tree.fields[1].parent, '["a.b"]')
    const definition = studioSchemaTree(schema({ type: 'object', properties: { active: { type: 'boolean', default: false }, amount: { type: 'number', examples: [0] } } }), 'schema')
    assert.deepEqual(definition.fields.map((field) => field.value), ['false', '0'])
  })
  it('namespace içinde slash bulunan XML yollarını kısaltırken kimliklerini değiştirmez', () => {
    const tree = studioSchemaTree({ id: 40, schemaType: 'SOURCE_TO_MW_REQUEST', format: 'XML', schemaDefinition: { fields: [{ path: '/{https://example.test/ns}order', type: 'object', children: [{ path: '/{https://example.test/ns}order/@id', type: 'string' }] }] } })
    assert.equal(tree.fields[0].name, '{https://example.test/ns}order')
    assert.equal(tree.fields[1].name, '@id')
    assert.equal(tree.fields[1].parent, '/{https://example.test/ns}order')
  })
  it('birleşik şemada sonradan bulunan alanı doğru üst nesneye yerleştirir', () => {
    const tree = studioSchemaTree(schema({ allOf: [{ properties: { a: { properties: { x: { type: 'string' } } }, b: { type: 'number' } } }, { properties: { a: { properties: { y: { type: 'string' } } } } }] }), 'schema')
    assert.deepEqual(tree.fields.map((field) => field.path), ['a', 'a.x', 'a.y', 'b'])
    assert.equal(tree.fields.find((field) => field.path === 'a.y').parent, 'a')
  })
  it('aramada üst dalları açar; eşlenmemiş filtrede bağlantıları değil yalnızca görünümü süzer', () => {
    const tree = studioSchemaTree(schema({ customer: { address: { city: 'İstanbul', zip: '34394' } } }), 'sample')
    const expanded = defaultExpanded(tree.fields)
    expanded.clear()
    const linked = new Set(['customer.address.zip'])
    assert.equal(visibleStudioFields(tree.fields, expanded, '', linked, false).length, 1)
    assert.deepEqual(visibleStudioFields(tree.fields, expanded, 'İstanbul', linked, false).map((field) => field.path), ['customer', 'customer.address', 'customer.address.city'])
    assert.ok(!visibleStudioFields(tree.fields, expanded, '', linked, true).some((field) => field.path === 'customer.address.zip'))
    assert.equal(tree.fields.length, 4)
    assert.equal(linked.size, 1)
  })
})
