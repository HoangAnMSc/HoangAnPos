-- Preserve existing card preferences while enabling the compare-price field
-- for installations created before the shared Product/POS card was added.
begin;

update public.product_settings
set card_settings = jsonb_set(
  jsonb_set(
    coalesce(card_settings, '{}'::jsonb),
    '{visibleFields}',
    case
      when coalesce(card_settings->'visibleFields', '[]'::jsonb) ? 'compare_price'
        then coalesce(card_settings->'visibleFields', '[]'::jsonb)
      else coalesce(card_settings->'visibleFields', '[]'::jsonb) || '"compare_price"'::jsonb
    end,
    true
  ),
  '{posCard}',
  coalesce(card_settings->'posCard', '{}'::jsonb) || jsonb_build_object(
    'visibleFields',
    case
      when coalesce(card_settings#>'{posCard,visibleFields}', '[]'::jsonb) ? 'compare_price'
        then coalesce(card_settings#>'{posCard,visibleFields}', '[]'::jsonb)
      else coalesce(card_settings#>'{posCard,visibleFields}', '[]'::jsonb) || '"compare_price"'::jsonb
    end
  ),
  true
)
where id = 'default';

commit;
