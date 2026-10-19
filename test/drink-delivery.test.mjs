import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {setupFulfillment} from '../fulfillment.mjs';
test('drink gifts require a valid day and time range, milk tea flavor, and retain immutable details',()=>{
 const db=new DatabaseSync(':memory:');try{
 db.exec('PRAGMA foreign_keys=ON;create table spins(id integer primary key,gift text);create table choices(user_id integer primary key,spin_id integer);');
 const gifts=[{id:'tea',cashValue:30000},{id:'lemon-tea',cashValue:10000},{id:'bear',cashValue:100000}];const f=setupFulfillment(db,gifts);
 for(const [i,gift]of gifts.entries()){db.prepare('insert into spins values(?,?)').run(i+1,JSON.stringify(gift));db.prepare('insert into choices values(?,?)').run(i+1,i+1);}
 const base={mode:'gift',phone:'0900000000',address:'Địa chỉ kiểm thử không giao hàng',deliveryDate:'2030-10-20',deliveryFrom:'14:00',deliveryTo:'16:00',drinkFlavor:'Ô long, ít đường, ít đá'};
 for(const bad of [{deliveryDate:''},{deliveryDate:'2030-02-30'},{deliveryDate:'2020-01-01'},{deliveryFrom:'25:00'},{deliveryTo:'14:00'},{deliveryTo:'13:00'},{drinkFlavor:''},{drinkFlavor:'a'.repeat(121)}])assert.throws(()=>f.save(1,{...base,...bad}));
 const saved=f.save(1,base);assert.equal(saved.deliveryDate,'2030-10-20');assert.equal(saved.deliveryFrom,'14:00');assert.equal(saved.drinkFlavor,base.drinkFlavor);assert.throws(()=>f.save(1,base));
 assert.throws(()=>f.save(2,{...base,deliveryTo:''}));const lemon=f.save(2,{...base,drinkFlavor:'Không lưu vị cho trà chanh'});assert.equal(lemon.deliveryTo,'16:00');assert.equal(lemon.drinkFlavor,undefined);
 const other=f.save(3,{mode:'gift',phone:base.phone,address:base.address});assert.equal(other.deliveryDate,undefined);
 }finally{db.close();}
});
