from django.db import migrations, models
import colorfield.fields


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0034_alter_postmarkvaluation_options_postmark_catalog_txt_and_more'),
    ]

    operations = [
        # Color: rename color_name → name, color_value → hex_val, drop PK db_column
        migrations.RenameField(
            model_name='color',
            old_name='color_name',
            new_name='name',
        ),
        migrations.RenameField(
            model_name='color',
            old_name='color_value',
            new_name='hex_val',
        ),
        migrations.AlterField(
            model_name='color',
            name='color_id',
            field=models.AutoField(primary_key=True, serialize=False),
        ),

        # Auxmark: rename inscription_text → inscription_txt
        migrations.RenameField(
            model_name='auxmark',
            old_name='inscription_text',
            new_name='inscription_txt',
        ),
    ]
