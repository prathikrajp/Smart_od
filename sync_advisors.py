import csv
import os

def sync_advisors():
    base_path = '/home/sabareesh/Desktop/smartod'
    advisors_file = os.path.join(base_path, 'advisors.csv')
    students_files = [
        os.path.join(base_path, 'students.csv'),
        os.path.join(base_path, 'public', 'students.csv')
    ]

    # Load advisor mapping: className -> advisorName
    advisor_map = {}
    with open(advisors_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            advisor_map[row['className']] = row['name']

    # Update students.csv files
    for students_file in students_files:
        if not os.path.exists(students_file):
            print(f"File {students_file} not found, skipping.")
            continue

        updated_rows = []
        with open(students_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            fieldnames = reader.fieldnames
            for row in reader:
                class_name = row['className']
                if class_name in advisor_map:
                    row['classAdvisorName'] = advisor_map[class_name]
                updated_rows.append(row)

        with open(students_file, 'w', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(updated_rows)
        print(f"Updated {students_file}")

if __name__ == "__main__":
    sync_advisors()
