begin;
update lucky_bloom.prizes set quantity=1 where id='special';
update lucky_bloom.prizes set quantity=2 where id='first';
update lucky_bloom.prizes set quantity=12 where id='second';
update lucky_bloom.prizes set quantity=12 where id='third';
update lucky_bloom.prizes set quantity=15 where id='encourage';
commit;
