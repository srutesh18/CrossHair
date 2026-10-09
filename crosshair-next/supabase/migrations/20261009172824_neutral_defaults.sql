-- New workspaces start with a neutral product name, not the old demo one.
alter table orgs alter column product_name set default 'My product';
