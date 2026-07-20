using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace git_23
{
    internal class Program
    {
        static void Main(string[] args)
        {
            int i;
            int acumulador = 0;
            int precio;

            for (i = 1; i <= 5; i++)
            {
                Console.WriteLine("Ingresa el precio del producto: ");
                precio = Convert.ToInt32(Console.ReadLine());

                acumulador = acumulador + precio; 
            }

            Console.WriteLine("El total es: {0}", acumulador);
        }
    }
}
